"""Offices (مكاتب عقارية) as first-class citizens.

Authorization rules:
  * The office owner (OfficeProfile.owner_user_id) can do everything.
  * Active members can read, manage listings/leads; only owner/manager can
    invite, suspend or change roles.
  * Every agent has their own OTP login — no shared credentials.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any
from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.phone import normalize_phone
from app.models.catalog import Listing
from app.models.enums import (
    LEAD_STAGES,
    LeadStage,
    OfficeMemberRole,
    OfficeMemberStatus,
    OfficeVerificationStatus,
)
from app.models.growth import Lead, LeadEvent, OfficeMember, OfficeProfile
from app.models.identity import User
from app.services.common import utcnow
from app.services.entitlements import seat_limit

MANAGER_ROLES = (OfficeMemberRole.owner.value, OfficeMemberRole.manager.value)
TEAM_ROLES = tuple(r.value for r in OfficeMemberRole)


def slugify(value: str) -> str:
    """ASCII-safe slug: Latin names transliterated, Arabic gets a stable hash."""
    normalized = unicodedata.normalize("NFKD", value.strip().lower())
    ascii_part = "".join(c for c in normalized if c.isascii() and (c.isalnum() or c == " "))
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_part).strip("-")
    if slug:
        return slug[:70]
    import hashlib

    return "office-" + hashlib.sha1(value.encode("utf-8")).hexdigest()[:10]


def office_for_user(db: Session, user: User) -> OfficeProfile | None:
    owned = db.execute(
        select(OfficeProfile).where(OfficeProfile.owner_user_id == user.id)
    ).scalar_one_or_none()
    if owned is not None:
        return owned
    member = db.execute(
        select(OfficeMember).where(
            OfficeMember.user_id == user.id,
            OfficeMember.status == OfficeMemberStatus.active.value,
        )
    ).scalars().first()
    return db.get(OfficeProfile, member.office_id) if member else None


def role_for(db: Session, user: User, office: OfficeProfile) -> str | None:
    if office.owner_user_id == user.id:
        return OfficeMemberRole.owner.value
    member = db.execute(
        select(OfficeMember).where(
            OfficeMember.office_id == office.id,
            OfficeMember.user_id == user.id,
            OfficeMember.status == OfficeMemberStatus.active.value,
        )
    ).scalar_one_or_none()
    return member.role if member else None


def require_office_access(
    db: Session, user: User, office_id: UUID, *, manager: bool = False
) -> tuple[OfficeProfile, str]:
    office = db.get(OfficeProfile, office_id)
    if office is None or not office.active:
        raise AppError("OFFICE_NOT_FOUND", "Office not found", status_code=404)
    role = role_for(db, user, office)
    if role is None:
        raise AppError("OFFICE_FORBIDDEN", "You are not a member of this office", status_code=403)
    if manager and role not in MANAGER_ROLES:
        raise AppError("OFFICE_FORBIDDEN", "Owner/manager role required", status_code=403)
    return office, role


def create_office(db: Session, user: User, payload: dict[str, Any]) -> OfficeProfile:
    existing = db.execute(
        select(OfficeProfile).where(OfficeProfile.owner_user_id == user.id)
    ).scalar_one_or_none()
    if existing is not None:
        raise AppError("OFFICE_EXISTS", "This account already has an office", status_code=409)
    base = slugify(payload.get("name_en") or payload["name_ar"])
    slug = base
    n = 2
    while db.execute(select(OfficeProfile).where(OfficeProfile.slug == slug)).scalar_one_or_none():
        slug = f"{base}-{n}"
        n += 1
    office = OfficeProfile(
        owner_user_id=user.id,
        slug=slug,
        name_ar=payload["name_ar"],
        name_en=payload["name_en"] or payload["name_ar"],
        description_ar=payload.get("description_ar") or "",
        description_en=payload.get("description_en") or "",
        license_no=payload.get("license_no"),
        commercial_register=payload.get("commercial_register"),
        tax_id=payload.get("tax_id"),
        public_phone=normalize_phone(payload.get("public_phone") or user.phone),
        public_email=payload.get("public_email"),
        city=payload.get("city"),
        website=payload.get("website"),
        verification_status=OfficeVerificationStatus.pending.value,
    )
    db.add(office)
    db.flush()
    db.add(
        OfficeMember(
            office_id=office.id,
            user_id=user.id,
            invited_phone=user.phone,
            display_name=user.full_name,
            role=OfficeMemberRole.owner.value,
            status=OfficeMemberStatus.active.value,
            joined_at=utcnow(),
        )
    )
    user.account_type = "office"
    db.flush()
    return office


def accept_invites(db: Session, user: User) -> int:
    """Called after a successful OTP login: bind pending invites to this user."""
    invites = (
        db.execute(
            select(OfficeMember).where(
                OfficeMember.invited_phone == user.phone,
                OfficeMember.status == OfficeMemberStatus.invited.value,
            )
        )
        .scalars()
        .all()
    )
    for invite in invites:
        invite.user_id = user.id
        invite.status = OfficeMemberStatus.active.value
        invite.joined_at = utcnow()
    if invites:
        db.flush()
    return len(invites)


def invite_member(db: Session, user: User, office: OfficeProfile, payload: dict[str, Any]) -> OfficeMember:
    phone = normalize_phone(payload["invited_phone"])
    role = payload.get("role") or OfficeMemberRole.agent.value
    if role not in TEAM_ROLES or role == OfficeMemberRole.owner.value:
        raise AppError("INVALID_ROLE", "Role must be manager or agent", status_code=422)
    if phone == user.phone or db.execute(
        select(OfficeMember).where(
            OfficeMember.office_id == office.id, OfficeMember.invited_phone == phone
        )
    ).scalar_one_or_none():
        raise AppError("MEMBER_EXISTS", "This phone is already on the team", status_code=409)
    active_seats = db.execute(
        select(func.count())
        .select_from(OfficeMember)
        .where(
            OfficeMember.office_id == office.id,
            OfficeMember.status.in_(
                (OfficeMemberStatus.active.value, OfficeMemberStatus.invited.value)
            ),
        )
    ).scalar_one()
    if active_seats >= seat_limit(db, user):
        raise AppError(
            "SEAT_LIMIT_REACHED",
            "Your plan's team-seat limit is reached — upgrade the office plan",
            status_code=409,
            details={"seats": seat_limit(db, user)},
        )
    member = OfficeMember(
        office_id=office.id,
        invited_phone=phone,
        display_name=payload.get("display_name"),
        role=role,
        status=OfficeMemberStatus.invited.value,
    )
    db.add(member)
    db.flush()
    return member


def lead_to_dict(lead: Lead) -> dict[str, Any]:
    return {
        "id": str(lead.id),
        "office_id": str(lead.office_id),
        "listing_id": str(lead.listing_id) if lead.listing_id else None,
        "assigned_agent_id": str(lead.assigned_agent_id) if lead.assigned_agent_id else None,
        "tenant_name": lead.tenant_name,
        "tenant_phone": lead.tenant_phone,
        "budget_egp": lead.budget_egp,
        "note": lead.note,
        "source": lead.source,
        "stage": lead.stage,
        "commission_egp": float(lead.commission_egp) if lead.commission_egp is not None else None,
        "next_follow_up_at": lead.next_follow_up_at,
        "won_at": lead.won_at,
        "created_at": lead.created_at,
    }


def office_dict(office: OfficeProfile, *, public: bool = False) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": str(office.id),
        "slug": office.slug,
        "name_ar": office.name_ar,
        "name_en": office.name_en,
        "description_ar": office.description_ar,
        "description_en": office.description_en,
        "city": office.city,
        "public_phone": office.public_phone,
        "public_email": office.public_email,
        "website": office.website,
        "verification_status": office.verification_status,
        "verified_at": office.verified_at,
    }
    if not public:
        data.update(
            {
                "owner_user_id": str(office.owner_user_id),
                "license_no": office.license_no,
                "commercial_register": office.commercial_register,
                "tax_id": office.tax_id,
                "verification_note": office.verification_note,
                "active": office.active,
                "created_at": office.created_at,
            }
        )
    return data


def dashboard(db: Session, office: OfficeProfile) -> dict[str, Any]:
    """Performance dashboard: pipeline, conversion, inventory, agent leaderboard."""
    stage_counts = {
        stage: 0
        for stage in LEAD_STAGES
    }
    rows = db.execute(
        select(Lead.stage, func.count()).where(Lead.office_id == office.id).group_by(Lead.stage)
    ).all()
    for stage, count in rows:
        stage_counts[stage] = int(count)
    total_leads = sum(stage_counts.values())
    won = stage_counts[LeadStage.won.value]
    listings = (
        db.execute(select(Listing).where(Listing.office_id == office.id)).scalars().all()
    )
    by_agent = [
        {
            "agent_user_id": str(agent_id) if agent_id else None,
            "leads": int(count),
            "won": int(won_count),
        }
        for agent_id, count, won_count in db.execute(
            select(
                Lead.assigned_agent_id,
                func.count(),
                func.sum(case((Lead.stage == LeadStage.won.value, 1), else_=0)),
            )
            .where(Lead.office_id == office.id)
            .group_by(Lead.assigned_agent_id)
        ).all()
    ]
    due = db.execute(
        select(func.count())
        .select_from(Lead)
        .where(
            Lead.office_id == office.id,
            Lead.next_follow_up_at.is_not(None),
            Lead.next_follow_up_at <= utcnow(),
            Lead.stage.notin_((LeadStage.won.value, LeadStage.lost.value)),
        )
    ).scalar_one()
    return {
        "office_id": str(office.id),
        "leads_total": total_leads,
        "leads_by_stage": stage_counts,
        "won": won,
        "conversion_pct": round(100.0 * won / total_leads, 2) if total_leads else 0.0,
        "follow_ups_due": int(due),
        "listings_total": len(listings),
        "listings_by_status": _counts([row.status for row in listings]),
        "views_total": sum(int(row.view_count or 0) for row in listings),
        "agents": by_agent,
        "generated_at": utcnow(),
    }


def _counts(values: list[str]) -> dict[str, int]:
    out: dict[str, int] = {}
    for v in values:
        out[v] = out.get(v, 0) + 1
    return out


def add_lead_event(
    db: Session,
    lead: Lead,
    actor: User,
    kind: str,
    note: str = "",
    payload: dict | None = None,
) -> LeadEvent:
    event = LeadEvent(
        lead_id=lead.id,
        actor_user_id=actor.id,
        kind=kind,
        note=note,
        payload=payload or {},
    )
    db.add(event)
    db.flush()
    return event

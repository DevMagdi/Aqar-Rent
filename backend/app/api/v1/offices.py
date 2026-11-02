"""Real-estate offices (مكاتب عقارية): profiles, teams, listings, CRM-lite.

Positioning: "better than WhatsApp + Excel" for rental lead management, while
individual owners can still list directly. Money between office and owner is
never touched or settled here (commission_egp is a private record only).
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter
from fastapi import status as http_status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbDep, SettingsDep, StorageDep
from app.core.errors import AppError
from app.core.phone import normalize_phone
from app.core.rate_limit import check_rate_limit
from app.models.catalog import Listing
from app.models.enums import (
    LEAD_STAGES,
    LeadStage,
    OfficeMemberStatus,
    OfficeVerificationStatus,
)
from app.models.growth import Lead, LeadEvent, OfficeMember, OfficeProfile
from app.models.identity import User
from app.schemas.common import ActionOut
from app.schemas.growth import (
    LeadCreateIn,
    LeadEventIn,
    LeadEventOut,
    LeadOut,
    LeadPatchIn,
    OfficeCreateIn,
    OfficeDashboardOut,
    OfficeMemberIn,
    OfficeMemberOut,
    OfficeMemberPatchIn,
    OfficeOut,
    OfficePatchIn,
)
from app.services.common import utcnow
from app.services.office_service import (
    accept_invites,
    add_lead_event,
    create_office,
    dashboard,
    invite_member,
    lead_to_dict,
    office_dict,
    office_for_user,
    require_office_access,
    role_for,
)
from app.services.trust_service import trust_snapshot

router = APIRouter(tags=["offices"])


def _office_out(db, office: OfficeProfile, storage=None, *, public: bool = False) -> OfficeOut:
    owner = db.get(User, office.owner_user_id)
    payload = office_dict(office, public=public)
    payload["trust"] = trust_snapshot(db, owner) if owner else None
    if office.logo_key and storage is not None:
        payload["logo_url"] = storage.public_url(office.logo_key)
    return OfficeOut(**payload)


# ── profile ──────────────────────────────────────────────────────────────────


@router.post(
    "/offices",
    response_model=OfficeOut,
    status_code=http_status.HTTP_201_CREATED,
    summary="Create an office/agency profile (first-class account)",
)
def create(
    payload: OfficeCreateIn, user: CurrentUser, db: DbDep, storage: StorageDep, settings: SettingsDep
) -> OfficeOut:
    check_rate_limit(f"offices:create:{user.id}", 5, 3600)
    office = create_office(db, user, payload.model_dump())
    return _office_out(db, office, storage)


@router.get("/offices/me", response_model=OfficeOut, summary="My office (owner or active agent)")
def my_office(user: CurrentUser, db: DbDep, storage: StorageDep) -> OfficeOut:
    accept_invites(db, user)  # also catches invites created after the last login
    office = office_for_user(db, user)
    if office is None:
        raise AppError("OFFICE_NOT_FOUND", "No office profile for this account", status_code=404)
    return _office_out(db, office, storage)


@router.patch(
    "/offices/{office_id}", response_model=OfficeOut, summary="Update office profile (owner/manager)"
)
def patch_office(
    office_id: UUID, payload: OfficePatchIn, user: CurrentUser, db: DbDep, storage: StorageDep
) -> OfficeOut:
    office, _ = require_office_access(db, user, office_id, manager=True)
    data = payload.model_dump(exclude_unset=True)
    if "public_phone" in data and data["public_phone"]:
        data["public_phone"] = normalize_phone(data["public_phone"])
    for key, value in data.items():
        setattr(office, key, value)
    db.flush()
    return _office_out(db, office, storage)


@router.post(
    "/offices/{office_id}/verification-request",
    response_model=ActionOut,
    summary="Submit office licence/commercial-register data for staff review",
)
def request_verification(office_id: UUID, user: CurrentUser, db: DbDep) -> ActionOut:
    office, _ = require_office_access(db, user, office_id, manager=True)
    if not office.commercial_register and not office.license_no:
        raise AppError(
            "OFFICE_DOCUMENTS_MISSING",
            "Add a commercial register or licence number before requesting review",
            status_code=422,
        )
    office.verification_status = OfficeVerificationStatus.pending.value
    office.verification_note = None
    db.flush()
    return ActionOut(id=str(office.id), status=office.verification_status)


# ── public branded page ──────────────────────────────────────────────────────


@router.get("/offices/slug/{slug}", response_model=OfficeOut, summary="Public branded office page")
def public_office(slug: str, db: DbDep, storage: StorageDep) -> OfficeOut:
    office = db.execute(
        select(OfficeProfile).where(OfficeProfile.slug == slug, OfficeProfile.active.is_(True))
    ).scalar_one_or_none()
    if office is None:
        raise AppError("OFFICE_NOT_FOUND", "Office not found", status_code=404)
    return _office_out(db, office, storage, public=True)


@router.get("/offices/slug/{slug}/listings", summary="Office's public listings (ids + titles)")
def public_office_listings(slug: str, db: DbDep) -> dict:
    office = db.execute(
        select(OfficeProfile).where(OfficeProfile.slug == slug, OfficeProfile.active.is_(True))
    ).scalar_one_or_none()
    if office is None:
        raise AppError("OFFICE_NOT_FOUND", "Office not found", status_code=404)
    rows = (
        db.execute(
            select(Listing)
            .where(Listing.office_id == office.id, Listing.status == "active")
            .order_by(Listing.created_at.desc())
            .limit(60)
        )
        .scalars()
        .all()
    )
    return {
        "items": [
            {"id": str(row.id),
                "title": row.title,
                "rent_monthly": row.rent_monthly,
                "property_type": row.property_type,
                "city_id": str(row.city_id),
                "area_m2": row.area_m2,
            }
            for row in rows
        ],
        "office_verified": office.verification_status == OfficeVerificationStatus.verified.value,
    }


# ── team ─────────────────────────────────────────────────────────────────────


@router.post(
    "/offices/{office_id}/members",
    response_model=OfficeMemberOut,
    status_code=http_status.HTTP_201_CREATED,
    summary="Invite an agent/manager by phone (seat-limited by plan)",
)
def add_member(
    office_id: UUID,
    payload: OfficeMemberIn,
    user: CurrentUser,
    db: DbDep,
    settings: SettingsDep,
) -> OfficeMemberOut:
    office, _ = require_office_access(db, user, office_id, manager=True)
    check_rate_limit(
        f"offices:invite:{user.id}", settings.office_invite_rate_limit_per_hour, 3600
    )
    member = invite_member(db, user, office, payload.model_dump())
    return OfficeMemberOut(**_member_dict(member))


@router.get("/offices/{office_id}/members", response_model=list[OfficeMemberOut], summary="Team & invites")
def list_members(office_id: UUID, user: CurrentUser, db: DbDep) -> list[OfficeMemberOut]:
    require_office_access(db, user, office_id)
    rows = (
        db.execute(
            select(OfficeMember)
            .where(OfficeMember.office_id == office_id)
            .order_by(OfficeMember.created_at)
        )
        .scalars()
        .all()
    )
    return [OfficeMemberOut(**_member_dict(m)) for m in rows]


@router.patch(
    "/offices/{office_id}/members/{member_id}",
    response_model=OfficeMemberOut,
    summary="Change a member's role / suspend or reactivate",
)
def patch_member(
    office_id: UUID,
    member_id: UUID,
    payload: OfficeMemberPatchIn,
    user: CurrentUser,
    db: DbDep,
) -> OfficeMemberOut:
    require_office_access(db, user, office_id, manager=True)
    member = db.get(OfficeMember, member_id)
    if member is None or member.office_id != office_id:
        raise AppError("MEMBER_NOT_FOUND", "Team member not found", status_code=404)
    if member.role == "owner":
        raise AppError("INVALID_STATE", "The office owner seat cannot be changed", status_code=409)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(member, key, value)
    db.flush()
    return OfficeMemberOut(**_member_dict(member))


@router.delete(
    "/offices/{office_id}/members/{member_id}",
    response_model=ActionOut,
    summary="Remove a member (suspend, keep attribution)",
)
def remove_member(office_id: UUID, member_id: UUID, user: CurrentUser, db: DbDep) -> ActionOut:
    require_office_access(db, user, office_id, manager=True)
    member = db.get(OfficeMember, member_id)
    if member is None or member.office_id != office_id:
        raise AppError("MEMBER_NOT_FOUND", "Team member not found", status_code=404)
    if member.role == "owner":
        raise AppError("INVALID_STATE", "The office owner seat cannot be removed", status_code=409)
    member.status = OfficeMemberStatus.suspended.value
    db.flush()
    return ActionOut(id=str(member.id), status=member.status)


def _member_dict(m: OfficeMember) -> dict:
    return {
        "id": str(m.id),
        "office_id": str(m.office_id),
        "user_id": str(m.user_id) if m.user_id else None,
        "invited_phone": m.invited_phone,
        "display_name": m.display_name,
        "role": m.role,
        "status": m.status,
        "joined_at": m.joined_at,
        "created_at": m.created_at,
    }


# ── CRM-lite leads ───────────────────────────────────────────────────────────


@router.post(
    "/offices/{office_id}/leads",
    response_model=LeadOut,
    status_code=http_status.HTTP_201_CREATED,
    summary="Create a rental lead (pipeline entry)",
)
def create_lead(
    office_id: UUID,
    payload: LeadCreateIn,
    user: CurrentUser,
    db: DbDep,
    settings: SettingsDep,
) -> LeadOut:
    require_office_access(db, user, office_id)
    check_rate_limit(f"offices:leads:{user.id}", settings.lead_rate_limit_per_hour, 3600)
    if payload.listing_id is not None:
        listing = db.get(Listing, payload.listing_id)
        if listing is None or listing.office_id != office_id:
            raise AppError("LISTING_NOT_FOUND", "Listing not found for this office", status_code=404)
    data = payload.model_dump()
    data["tenant_phone"] = normalize_phone(data["tenant_phone"])
    lead = Lead(
        office_id=office_id,
        created_by=user.id,
        tenant_name=data["tenant_name"],
        tenant_phone=data["tenant_phone"],
        listing_id=data.get("listing_id"),
        assigned_agent_id=data.get("assigned_agent_id") or user.id,
        budget_egp=data.get("budget_egp"),
        note=data.get("note") or "",
        source=data.get("source") or "manual",
        stage=LeadStage.new.value,
        commission_egp=data.get("commission_egp"),
        next_follow_up_at=data.get("next_follow_up_at"),
    )
    db.add(lead)
    db.flush()
    add_lead_event(db, lead, user, "note", data.get("note") or "تم إنشاء العميل المحتمل")
    return LeadOut(**lead_to_dict(lead))


@router.get(
    "/offices/{office_id}/leads", response_model=list[LeadOut], summary="Leads (filter by stage/agent)"
)
def list_leads(
    office_id: UUID,
    user: CurrentUser,
    db: DbDep,
    stage: str | None = None,
    agent_id: UUID | None = None,
    limit: int = 100,
) -> list[LeadOut]:
    require_office_access(db, user, office_id)
    if stage is not None and stage not in LEAD_STAGES:
        raise AppError("INVALID_STAGE", "Unknown pipeline stage", status_code=422)
    stmt = select(Lead).where(Lead.office_id == office_id)
    if stage:
        stmt = stmt.where(Lead.stage == stage)
    if agent_id:
        stmt = stmt.where(Lead.assigned_agent_id == agent_id)
    rows = db.execute(stmt.order_by(Lead.created_at.desc()).limit(min(limit, 200))).scalars().all()
    return [LeadOut(**lead_to_dict(row)) for row in rows]


@router.patch(
    "/offices/{office_id}/leads/{lead_id}",
    response_model=LeadOut,
    summary="Move stage / assign agent / set follow-up (timeline recorded)",
)
def patch_lead(
    office_id: UUID,
    lead_id: UUID,
    payload: LeadPatchIn,
    user: CurrentUser,
    db: DbDep,
) -> LeadOut:
    require_office_access(db, user, office_id)
    lead = db.get(Lead, lead_id)
    if lead is None or lead.office_id != office_id:
        raise AppError("LEAD_NOT_FOUND", "Lead not found", status_code=404)
    data = payload.model_dump(exclude_unset=True)
    old_stage = lead.stage
    for key, value in data.items():
        setattr(lead, key, value)
    if "stage" in data and data["stage"] != old_stage:
        add_lead_event(
            db,
            lead,
            user,
            "stage_change",
            f"{old_stage} → {data['stage']}",
            {"from": old_stage, "to": data["stage"]},
        )
        if data["stage"] == LeadStage.won.value:
            lead.won_at = utcnow()
        else:
            lead.won_at = None
    elif "note" in data:
        add_lead_event(db, lead, user, "note", data.get("note") or "")
    db.flush()
    return LeadOut(**lead_to_dict(lead))


@router.post(
    "/offices/{office_id}/leads/{lead_id}/events",
    response_model=LeadEventOut,
    status_code=http_status.HTTP_201_CREATED,
    summary="Append a call/viewing/note to the lead timeline",
)
def create_lead_event(
    office_id: UUID,
    lead_id: UUID,
    payload: LeadEventIn,
    user: CurrentUser,
    db: DbDep,
) -> LeadEventOut:
    require_office_access(db, user, office_id)
    lead = db.get(Lead, lead_id)
    if lead is None or lead.office_id != office_id:
        raise AppError("LEAD_NOT_FOUND", "Lead not found", status_code=404)
    event = add_lead_event(db, lead, user, payload.kind, payload.note)
    return LeadEventOut(
        id=str(event.id),
        lead_id=str(lead.id),
        actor_user_id=str(user.id),
        kind=event.kind,
        note=event.note,
        created_at=event.created_at,
    )


@router.get(
    "/offices/{office_id}/leads/{lead_id}/events",
    response_model=list[LeadEventOut],
    summary="Lead timeline",
)
def lead_events(office_id: UUID, lead_id: UUID, user: CurrentUser, db: DbDep) -> list[LeadEventOut]:
    require_office_access(db, user, office_id)
    lead = db.get(Lead, lead_id)
    if lead is None or lead.office_id != office_id:
        raise AppError("LEAD_NOT_FOUND", "Lead not found", status_code=404)
    rows = (
        db.execute(select(LeadEvent).where(LeadEvent.lead_id == lead.id).order_by(LeadEvent.created_at))
        .scalars()
        .all()
    )
    return [
        LeadEventOut(
            id=str(e.id),
            lead_id=str(e.lead_id),
            actor_user_id=str(e.actor_user_id) if e.actor_user_id else None,
            kind=e.kind,
            note=e.note,
            created_at=e.created_at,
        )
        for e in rows
    ]


@router.get(
    "/offices/{office_id}/dashboard", response_model=OfficeDashboardOut, summary="Performance dashboard"
)
def office_dashboard(office_id: UUID, user: CurrentUser, db: DbDep) -> OfficeDashboardOut:
    office, _ = require_office_access(db, user, office_id)
    return OfficeDashboardOut(**dashboard(db, office))


@router.post(
    "/offices/{office_id}/listings/{listing_id}/assign",
    response_model=ActionOut,
    summary="Attach a listing to this office + responsible agent",
)
def assign_listing(
    office_id: UUID,
    listing_id: UUID,
    user: CurrentUser,
    db: DbDep,
    agent_id: UUID | None = None,
) -> ActionOut:
    office, _role = require_office_access(db, user, office_id)
    listing = db.get(Listing, listing_id)
    if listing is None or listing.owner_id != user.id:
        raise AppError("LISTING_NOT_FOUND", "Only your own listings can be assigned", status_code=404)
    if agent_id is not None:
        member = db.execute(
            select(OfficeMember).where(
                OfficeMember.office_id == office.id,
                OfficeMember.user_id == agent_id,
                OfficeMember.status == OfficeMemberStatus.active.value,
            )
        ).scalar_one_or_none()
        if member is None:
            raise AppError("MEMBER_NOT_FOUND", "Agent is not an active member", status_code=404)
    listing.office_id = office.id
    listing.agent_user_id = agent_id
    db.flush()
    return ActionOut(id=str(listing.id), status="assigned")


@router.get("/offices/{office_id}/listings", summary="Managed units (office view)")
def managed_listings(office_id: UUID, user: CurrentUser, db: DbDep) -> dict:
    office, _ = require_office_access(db, user, office_id)
    rows = db.execute(
        select(Listing).where(Listing.office_id == office_id).order_by(Listing.created_at.desc())
    ).scalars().all()
    return {
        "items": [
            {"id": str(row.id),
                "title": row.title,
                "status": row.status,
                "rent_monthly": row.rent_monthly,
                "agent_user_id": str(row.agent_user_id) if row.agent_user_id else None,
                "view_count": row.view_count,
            }
            for row in rows
        ],
        "total": len(rows),
        "role": role_for(db, user, office),
    }

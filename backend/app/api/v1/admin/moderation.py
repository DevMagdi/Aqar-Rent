"""Admin moderation: queue, approve/reject (preset reasons), admin detail."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select

from app.api.deps import DbDep, StorageDep, client_ip
from app.api.deps import require_roles
from app.core.errors import AppError
from app.models.catalog import Listing, Location
from app.models.enums import ListingStatus, StaffRole
from app.models.identity import StaffUser, User
from app.models.social import Report
from app.schemas.admin import ListingAdminDetailOut, QueueItemOut, RejectIn
from app.schemas.common import ActionOut
from app.services.moderation_service import approve_listing, location_label, reject_listing

router = APIRouter(prefix="/listings", tags=["admin-moderation"])


@router.get(
    "",
    response_model=list[QueueItemOut],
    summary="Moderation queue (submitted listings)",
)
def moderation_queue(
    db: DbDep,
    staff: StaffUser = Depends(require_roles(StaffRole.moderator)),
    status: str = Query(default="submitted"),
) -> list[QueueItemOut]:
    rows = db.execute(
        select(Listing)
        .where(Listing.status == status)
        .order_by(Listing.created_at.asc())
        .limit(200)
    ).scalars().all()
    if not rows:
        return []
    owners = {
        u.id: u
        for u in db.execute(
            select(User).where(User.id.in_([r.owner_id for r in rows]))
        ).scalars()
    }
    locs = db.execute(
        select(Location).where(Location.id.in_([r.governorate_id for r in rows]))
    ).scalars().all()
    gov_names = {l.id: l.name_ar for l in locs}
    report_counts = dict(
        db.execute(
            select(Report.listing_id, func.count())
            .where(Report.listing_id.in_([r.id for r in rows]))
            .group_by(Report.listing_id)
        ).all()
    )

    out: list[QueueItemOut] = []
    for r in rows:
        owner = owners.get(r.owner_id)
        out.append(
            QueueItemOut(
                id=str(r.id),
                listing_id=str(r.id),
                title=r.title,
                status=r.status,
                owner_phone=owner.phone if owner else None,
                owner_name=owner.full_name if owner else None,
                verification_status=owner.verification_status if owner else None,
                report_count=report_counts.get(r.id, 0),
                rent_monthly=r.rent_monthly,
                governorate_name=gov_names.get(r.governorate_id),
                reject_reason=r.reject_reason,
                created_at=r.created_at,
            )
        )
    return out


@router.get("/{listing_id}", response_model=ListingAdminDetailOut, summary="Listing detail (admin)")
def admin_listing_detail(
    listing_id: UUID,
    db: DbDep,
    storage: StorageDep,
    staff: StaffUser = Depends(require_roles(StaffRole.moderator)),
) -> ListingAdminDetailOut:
    listing = db.get(Listing, listing_id)
    if listing is None:
        raise AppError("LISTING_NOT_FOUND", "Listing not found", status_code=404)
    owner = db.get(User, listing.owner_id)
    reports_count = db.execute(
        select(func.count()).select_from(Report).where(Report.listing_id == listing.id)
    ).scalar_one()
    return ListingAdminDetailOut(
        id=str(listing.id),
        title=listing.title,
        status=listing.status,
        reject_reason=listing.reject_reason,
        rent_monthly=listing.rent_monthly,
        property_type=listing.property_type,
        governorate_name=location_label(db, listing.governorate_id),
        city_name=location_label(db, listing.city_id),
        district_name=location_label(db, listing.district_id),
        address_text=listing.address_text,
        description=listing.description,
        owner_id=str(listing.owner_id),
        owner_phone=owner.phone if owner else "",
        owner_name=owner.full_name if owner else None,
        owner_verification_status=owner.verification_status if owner else "unknown",
        reports_count=reports_count,
        media_urls=[storage.public_url(m.file_key) for m in listing.media],
        created_at=listing.created_at,
        published_at=listing.published_at,
        view_count=listing.view_count,
    )


@router.post(
    "/{listing_id}/approve",
    response_model=ActionOut,
    summary="Approve (BR-6 enforced)",
)
def approve(
    listing_id: UUID,
    db: DbDep,
    staff: StaffUser = Depends(require_roles(StaffRole.moderator)),
    ip: str = Depends(client_ip),
) -> ActionOut:
    listing = db.get(Listing, listing_id)
    if listing is None:
        raise AppError("LISTING_NOT_FOUND", "Listing not found", status_code=404)
    listing = approve_listing(db, staff.id, listing, ip=ip)
    return ActionOut(id=str(listing.id), status=listing.status)


@router.post(
    "/{listing_id}/reject",
    response_model=ActionOut,
    summary="Reject with preset reason",
)
def reject(
    listing_id: UUID,
    payload: RejectIn,
    db: DbDep,
    staff: StaffUser = Depends(require_roles(StaffRole.moderator)),
    ip: str = Depends(client_ip),
) -> ActionOut:
    listing = db.get(Listing, listing_id)
    if listing is None:
        raise AppError("LISTING_NOT_FOUND", "Listing not found", status_code=404)
    listing = reject_listing(db, staff.id, listing, payload.reason_code, payload.note, ip=ip)
    return ActionOut(id=str(listing.id), status=listing.status, reject_reason=listing.reject_reason)

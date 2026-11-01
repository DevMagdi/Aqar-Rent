"""Admin users: list, detail, ban/unban, per-user listing cap (BR-7)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select

from app.api.deps import DbDep, client_ip, require_roles
from app.core.errors import AppError
from app.models.catalog import Listing
from app.models.enums import StaffRole, UserStatus
from app.models.identity import StaffUser, User
from app.schemas.admin import AdminUserOut, AdminUserPatchIn
from app.schemas.common import ActionOut
from app.services.moderation_service import log_audit

router = APIRouter(prefix="/users", tags=["admin-users"])


def _user_out(db, user: User, listings_count: int | None = None) -> AdminUserOut:
    if listings_count is None:
        listings_count = db.execute(
            select(func.count()).select_from(Listing).where(Listing.owner_id == user.id)
        ).scalar_one()
    return AdminUserOut(
        id=str(user.id),
        phone=user.phone,
        full_name=user.full_name,
        email=user.email,
        status=user.status,
        verification_status=user.verification_status,
        listing_cap=user.listing_cap,
        listings_count=listings_count,
        created_at=user.created_at,
    )


@router.get("", response_model=list[AdminUserOut], summary="List users")
def users_list(
    db: DbDep,
    staff: StaffUser = Depends(require_roles(StaffRole.moderator)),
    q: str | None = Query(default=None, max_length=100),
    status: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[AdminUserOut]:
    stmt = select(User)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(User.phone.like(like), User.full_name.like(like), User.email.like(like)))
    if status:
        stmt = stmt.where(User.status == status)
    rows = db.execute(stmt.order_by(User.created_at.desc()).limit(limit)).scalars().all()
    return [_user_out(db, u) for u in rows]


@router.get("/{user_id}", response_model=AdminUserOut, summary="User detail")
def user_detail(
    user_id: UUID,
    db: DbDep,
    staff: StaffUser = Depends(require_roles(StaffRole.moderator)),
) -> AdminUserOut:
    user = db.get(User, user_id)
    if user is None:
        raise AppError("USER_NOT_FOUND", "User not found", status_code=404)
    return _user_out(db, user)


@router.patch("/{user_id}", response_model=AdminUserOut, summary="Ban/unban, raise listing cap")
def user_patch(
    user_id: UUID,
    payload: AdminUserPatchIn,
    db: DbDep,
    staff: StaffUser = Depends(require_roles(StaffRole.super_admin)),
    ip: str = Depends(client_ip),
) -> AdminUserOut:
    user = db.get(User, user_id)
    if user is None:
        raise AppError("USER_NOT_FOUND", "User not found", status_code=404)
    before = {"status": user.status, "listing_cap": user.listing_cap}
    if payload.status is not None:
        if user.status == UserStatus.deleted.value:
            raise AppError("USER_DELETED", "Deleted accounts cannot be changed", status_code=409)
        user.status = payload.status  # banning the phone = banning the only login identity
    if payload.clear_listing_cap:
        user.listing_cap = None
    elif payload.listing_cap is not None:
        user.listing_cap = payload.listing_cap
    db.flush()
    log_audit(
        db,
        staff.id,
        "user.update" + (".ban" if payload.status == UserStatus.banned.value else ""),
        "user",
        user.id,
        before,
        {"status": user.status, "listing_cap": user.listing_cap},
        ip,
    )
    return _user_out(db, user)

"""Admin promo codes CRUD (BR-9)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.deps import DbDep, client_ip, require_roles
from app.core.errors import AppError
from app.models.commerce import PromoCode
from app.models.enums import StaffRole
from app.models.identity import StaffUser
from app.schemas.admin import PromoAdminIn, PromoAdminOut, PromoAdminPatchIn
from app.schemas.common import ActionOut
from app.services.moderation_service import log_audit

router = APIRouter(prefix="/promo-codes", tags=["admin-promos"])


def _out(p: PromoCode) -> PromoAdminOut:
    return PromoAdminOut(
        id=str(p.id),
        code=p.code,
        type=p.type,
        value=float(p.value),
        max_uses=p.max_uses,
        used_count=p.used_count,
        expires_at=p.expires_at,
        active=p.active,
        created_at=p.created_at,
    )


@router.get("", response_model=list[PromoAdminOut], summary="All promo codes")
def promos_list(db: DbDep, staff: StaffUser = Depends(require_roles(StaffRole.super_admin))):
    return [_out(p) for p in db.execute(select(PromoCode).order_by(PromoCode.created_at)).scalars()]


@router.post("", response_model=PromoAdminOut, status_code=201, summary="Create a promo code")
def promo_create(
    payload: PromoAdminIn,
    db: DbDep,
    staff: StaffUser = Depends(require_roles(StaffRole.super_admin)),
    ip: str = Depends(client_ip),
):
    code = payload.code.upper().strip()
    if db.execute(select(PromoCode).where(PromoCode.code == code)).scalar_one_or_none():
        raise AppError("PROMO_EXISTS", "Promo code already exists", status_code=409)
    data = payload.model_dump()
    data["code"] = code
    promo = PromoCode(**data)
    db.add(promo)
    db.flush()
    log_audit(db, staff.id, "promo.create", "promo_code", promo.id, None, data, ip)
    return _out(promo)


@router.patch("/{promo_id}", response_model=PromoAdminOut, summary="Update a promo code")
def promo_patch(
    promo_id: UUID,
    payload: PromoAdminPatchIn,
    db: DbDep,
    staff: StaffUser = Depends(require_roles(StaffRole.super_admin)),
    ip: str = Depends(client_ip),
):
    promo = db.get(PromoCode, promo_id)
    if promo is None:
        raise AppError("PROMO_NOT_FOUND", "Promo code not found", status_code=404)
    data = payload.model_dump(exclude_unset=True)
    before = {"active": promo.active, "value": str(promo.value)}
    for k, v in data.items():
        setattr(promo, k, v)
    db.flush()
    log_audit(db, staff.id, "promo.update", "promo_code", promo.id, before, data, ip)
    return _out(promo)


@router.delete("/{promo_id}", response_model=ActionOut, summary="Deactivate a promo code")
def promo_delete(
    promo_id: UUID,
    db: DbDep,
    staff: StaffUser = Depends(require_roles(StaffRole.super_admin)),
    ip: str = Depends(client_ip),
):
    promo = db.get(PromoCode, promo_id)
    if promo is None:
        raise AppError("PROMO_NOT_FOUND", "Promo code not found", status_code=404)
    promo.active = False
    db.flush()
    log_audit(db, staff.id, "promo.deactivate", "promo_code", promo.id, None, {"active": False}, ip)
    return ActionOut(id=str(promo.id), status="deactivated")

"""Admin plans CRUD (BR-1: prices only change here, never in code)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.deps import DbDep, client_ip, require_roles
from app.core.errors import AppError
from app.models.catalog import Plan
from app.models.enums import StaffRole
from app.models.identity import StaffUser
from app.schemas.admin import PlanAdminIn, PlanAdminOut, PlanAdminPatchIn
from app.schemas.common import ActionOut
from app.services.moderation_service import log_audit

router = APIRouter(prefix="/plans", tags=["admin-plans"])


def _out(p: Plan) -> PlanAdminOut:
    return PlanAdminOut(
        id=str(p.id),
        name=p.name,
        price_egp=float(p.price_egp),
        duration_days=p.duration_days,
        priority_weight=p.priority_weight,
        active=p.active,
        created_at=p.created_at,
    )


@router.get("", response_model=list[PlanAdminOut], summary="All plans (incl. inactive)")
def plans_list(db: DbDep, staff: StaffUser = Depends(require_roles(StaffRole.moderator))):
    return [_out(p) for p in db.execute(select(Plan).order_by(Plan.created_at)).scalars()]


@router.post("", response_model=PlanAdminOut, status_code=201, summary="Create a plan")
def plan_create(
    payload: PlanAdminIn,
    db: DbDep,
    staff: StaffUser = Depends(require_roles(StaffRole.super_admin)),
    ip: str = Depends(client_ip),
):
    plan = Plan(**payload.model_dump())
    db.add(plan)
    db.flush()
    log_audit(db, staff.id, "plan.create", "plan", plan.id, None, payload.model_dump(), ip)
    return _out(plan)


@router.patch("/{plan_id}", response_model=PlanAdminOut, summary="Update a plan")
def plan_patch(
    plan_id: UUID,
    payload: PlanAdminPatchIn,
    db: DbDep,
    staff: StaffUser = Depends(require_roles(StaffRole.super_admin)),
    ip: str = Depends(client_ip),
):
    plan = db.get(Plan, plan_id)
    if plan is None:
        raise AppError("PLAN_NOT_FOUND", "Plan not found", status_code=404)
    data = payload.model_dump(exclude_unset=True)
    before = {"price_egp": str(plan.price_egp), "active": plan.active}
    for k, v in data.items():
        setattr(plan, k, v)
    db.flush()
    log_audit(db, staff.id, "plan.update", "plan", plan.id, before, data, ip)
    return _out(plan)


@router.delete("/{plan_id}", response_model=ActionOut, summary="Deactivate a plan")
def plan_delete(
    plan_id: UUID,
    db: DbDep,
    staff: StaffUser = Depends(require_roles(StaffRole.super_admin)),
    ip: str = Depends(client_ip),
):
    plan = db.get(Plan, plan_id)
    if plan is None:
        raise AppError("PLAN_NOT_FOUND", "Plan not found", status_code=404)
    before = {"active": plan.active}
    plan.active = False  # soft delete: historical ad periods keep referencing it
    db.flush()
    log_audit(db, staff.id, "plan.deactivate", "plan", plan.id, before, {"active": False}, ip)
    return ActionOut(id=str(plan.id), status="deactivated")

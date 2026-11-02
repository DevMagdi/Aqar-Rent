"""Admin: plans, packages, office verification, appeals, payment audit trail.

All mutating routes are role-gated + written to the existing audit log, so the
new revenue surface has the same accountability as Phase 1–4 finance actions.
"""

from __future__ import annotations

from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.api.deps import DbDep, client_ip, require_roles
from app.core.errors import AppError
from app.models.enums import (
    AppealStatus,
    OfficeVerificationStatus,
    StaffRole,
    VerificationLevel,
)
from app.models.growth import (
    AdPackage,
    OfficeProfile,
    PaymentEvent,
    SubscriptionPlan,
)
from app.models.identity import StaffUser, User, VerificationDocument
from app.schemas.common import ActionOut
from app.schemas.growth import (
    AdPackageAdminIn,
    AdPackageAdminPatchIn,
    AdPackageOut,
    AppealDecisionIn,
    OfficeVerificationDecisionIn,
    PaymentEventOut,
    ReconciliationOut,
    SubscriptionPlanAdminIn,
    SubscriptionPlanAdminPatchIn,
    SubscriptionPlanOut,
    TrustGrantIn,
)
from app.services.common import utcnow
from app.services.moderation_service import log_audit
from app.services.payment_audit import reconciliation
from app.services.subscription_service import package_totals, subscription_plan_dict
from app.services.trust_service import recompute_level

router = APIRouter(prefix="/growth", tags=["admin-growth"])

SuperAdmin = Depends(require_roles(StaffRole.super_admin))
Moderator = Depends(require_roles(StaffRole.moderator))
Finance = Depends(require_roles(StaffRole.finance))


# ── subscription plans ───────────────────────────────────────────────────────


@router.get("/subscription-plans", response_model=list[SubscriptionPlanOut], summary="All subscription tiers")
def list_subscription_plans(db: DbDep, staff: StaffUser = SuperAdmin):
    rows = db.execute(select(SubscriptionPlan).order_by(SubscriptionPlan.created_at)).scalars().all()
    return [SubscriptionPlanOut(**subscription_plan_dict(p)) for p in rows]


@router.post(
    "/subscription-plans",
    response_model=SubscriptionPlanOut,
    status_code=201,
    summary="Create a subscription tier",
)
def create_subscription_plan(
    payload: SubscriptionPlanAdminIn,
    db: DbDep,
    staff: StaffUser = SuperAdmin,
    ip: str = Depends(client_ip),
):
    if db.execute(select(SubscriptionPlan).where(SubscriptionPlan.code == payload.code)).scalar_one_or_none():
        raise AppError("PLAN_CODE_TAKEN", "Plan code already exists", status_code=409)
    data = payload.model_dump()
    data["audience"] = payload.audience.value
    plan = SubscriptionPlan(**data)
    db.add(plan)
    db.flush()
    log_audit(db, staff.id, "subscription_plan.create", "subscription_plan", plan.id, None, data, ip)
    return SubscriptionPlanOut(**subscription_plan_dict(plan))


@router.patch(
    "/subscription-plans/{plan_id}",
    response_model=SubscriptionPlanOut,
    summary="Update a subscription tier (price, limits, seats, features)",
)
def patch_subscription_plan(
    plan_id: UUID,
    payload: SubscriptionPlanAdminPatchIn,
    db: DbDep,
    staff: StaffUser = SuperAdmin,
    ip: str = Depends(client_ip),
):
    plan = db.get(SubscriptionPlan, plan_id)
    if plan is None:
        raise AppError("PLAN_NOT_FOUND", "Plan not found", status_code=404)
    before = subscription_plan_dict(plan)
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(plan, key, value)
    db.flush()
    log_audit(
        db, staff.id, "subscription_plan.update", "subscription_plan", plan.id, before, data, ip
    )
    return SubscriptionPlanOut(**subscription_plan_dict(plan))


@router.delete("/subscription-plans/{plan_id}", response_model=ActionOut, summary="Deactivate a tier")
def deactivate_subscription_plan(
    plan_id: UUID,
    db: DbDep,
    staff: StaffUser = SuperAdmin,
    ip: str = Depends(client_ip),
):
    plan = db.get(SubscriptionPlan, plan_id)
    if plan is None:
        raise AppError("PLAN_NOT_FOUND", "Plan not found", status_code=404)
    plan.active = False
    log_audit(
        db, staff.id, "subscription_plan.deactivate", "subscription_plan", plan.id,
        {"active": True}, {"active": False}, ip,
    )
    db.flush()
    return ActionOut(id=str(plan.id), status="deactivated")


# ── ad packages ──────────────────────────────────────────────────────────────


@router.get("/ad-packages", response_model=list[AdPackageOut], summary="All multi-week packages")
def list_packages(db: DbDep, staff: StaffUser = SuperAdmin):
    rows = db.execute(select(AdPackage).order_by(AdPackage.weeks)).scalars().all()
    return [
        AdPackageOut(
            id=str(p.id),
            code=p.code,
            name_ar=p.name_ar,
            name_en=p.name_en,
            weeks=p.weeks,
            discount_pct=float(p.discount_pct),
            is_featured=p.is_featured,
            priority_weight=p.priority_weight,
            **{k: v for k, v in package_totals(db, p).items() if k in ("subtotal", "discount", "total")},
        )
        for p in rows
    ]


@router.post("/ad-packages", response_model=AdPackageOut, status_code=201, summary="Create a package")
def create_package(
    payload: AdPackageAdminIn,
    db: DbDep,
    staff: StaffUser = SuperAdmin,
    ip: str = Depends(client_ip),
):
    if db.execute(select(AdPackage).where(AdPackage.code == payload.code)).scalar_one_or_none():
        raise AppError("PACKAGE_CODE_TAKEN", "Package code already exists", status_code=409)
    package = AdPackage(**payload.model_dump())
    db.add(package)
    db.flush()
    log_audit(db, staff.id, "ad_package.create", "ad_package", package.id, None, payload.model_dump(), ip)
    return _package_out(db, package)


@router.patch("/ad-packages/{package_id}", response_model=AdPackageOut, summary="Update a package")
def patch_package(
    package_id: UUID,
    payload: AdPackageAdminPatchIn,
    db: DbDep,
    staff: StaffUser = SuperAdmin,
    ip: str = Depends(client_ip),
):
    package = db.get(AdPackage, package_id)
    if package is None:
        raise AppError("PACKAGE_NOT_FOUND", "Package not found", status_code=404)
    before = {"weeks": package.weeks, "discount_pct": float(package.discount_pct)}
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(package, key, value)
    db.flush()
    log_audit(
        db, staff.id, "ad_package.update", "ad_package", package.id,
        before, payload.model_dump(exclude_unset=True), ip,
    )
    return _package_out(db, package)


@router.delete("/ad-packages/{package_id}", response_model=ActionOut, summary="Deactivate a package")
def deactivate_package(
    package_id: UUID,
    db: DbDep,
    staff: StaffUser = SuperAdmin,
    ip: str = Depends(client_ip),
):
    package = db.get(AdPackage, package_id)
    if package is None:
        raise AppError("PACKAGE_NOT_FOUND", "Package not found", status_code=404)
    package.active = False
    log_audit(
        db, staff.id, "ad_package.deactivate", "ad_package", package.id,
        {"active": True}, {"active": False}, ip,
    )
    db.flush()
    return ActionOut(id=str(package.id), status="deactivated")


def _package_out(db, p: AdPackage) -> AdPackageOut:
    totals = package_totals(db, p)
    return AdPackageOut(
        id=str(p.id),
        code=p.code,
        name_ar=p.name_ar,
        name_en=p.name_en,
        weeks=p.weeks,
        discount_pct=float(p.discount_pct),
        is_featured=p.is_featured,
        priority_weight=p.priority_weight,
        subtotal=totals["subtotal"],
        discount=totals["discount"],
        total=totals["total"],
    )


# ── office verification ──────────────────────────────────────────────────────


@router.get("/offices", summary="Office verification queue (moderator)")
def offices_queue(db: DbDep, staff: StaffUser = Moderator, status: str | None = None):
    stmt = select(OfficeProfile)
    if status:
        stmt = stmt.where(OfficeProfile.verification_status == status)
    rows = db.execute(stmt.order_by(OfficeProfile.created_at)).scalars().all()
    return [
        {
            "id": str(o.id),
            "slug": o.slug,
            "name_ar": o.name_ar,
            "name_en": o.name_en,
            "commercial_register": o.commercial_register,
            "license_no": o.license_no,
            "tax_id": o.tax_id,
            "public_phone": o.public_phone,
            "verification_status": o.verification_status,
            "created_at": o.created_at,
        }
        for o in rows
    ]


@router.post("/offices/{office_id}/decision", response_model=ActionOut, summary="Verify / reject an office")
def office_decision(
    office_id: UUID,
    payload: OfficeVerificationDecisionIn,
    db: DbDep,
    staff: StaffUser = Moderator,
    ip: str = Depends(client_ip),
):
    office = db.get(OfficeProfile, office_id)
    if office is None:
        raise AppError("OFFICE_NOT_FOUND", "Office not found", status_code=404)
    before = {"verification_status": office.verification_status}
    if payload.decision == "verify":
        office.verification_status = OfficeVerificationStatus.verified.value
        office.verified_at = utcnow()
        office.verification_note = None
    elif payload.decision == "reject":
        office.verification_status = OfficeVerificationStatus.rejected.value
        office.verification_note = payload.note or "Commercial registration data could not be verified"
    else:
        office.verification_status = OfficeVerificationStatus.pending.value
        office.verification_note = payload.note or "Additional documents requested"
    log_audit(
        db, staff.id, f"office.{payload.decision}", "office_profile", office.id,
        before,
        {"verification_status": office.verification_status, "note": office.verification_note},
        ip,
    )
    db.flush()
    return ActionOut(id=str(office.id), status=office.verification_status)


# ── appeals & premium badges ─────────────────────────────────────────────────


@router.get("/appeals", summary="Pending verification appeals (moderator)")
def appeals_queue(db: DbDep, staff: StaffUser = Moderator):
    rows = (
        db.execute(
            select(VerificationDocument)
            .where(VerificationDocument.appeal_status == AppealStatus.pending.value)
            .order_by(VerificationDocument.appeal_submitted_at)
        )
        .scalars()
        .all()
    )
    return [
        {
            "doc_id": str(d.id),
            "user_id": str(d.user_id),
            "doc_type": d.doc_type,
            "reject_reason": d.reject_reason,
            "reject_reason_code": d.reject_reason_code,
            "appeal_note": d.appeal_note,
            "appeal_submitted_at": d.appeal_submitted_at,
        }
        for d in rows
    ]


@router.post(
    "/appeals/{doc_id}/decision",
    response_model=ActionOut,
    summary="Accept (reopen) or reject an appeal",
)
def appeal_decision(
    doc_id: UUID,
    payload: AppealDecisionIn,
    db: DbDep,
    staff: StaffUser = Moderator,
    ip: str = Depends(client_ip),
):
    doc = db.get(VerificationDocument, doc_id)
    if doc is None or doc.appeal_status != AppealStatus.pending.value:
        raise AppError("APPEAL_NOT_FOUND", "Pending appeal not found", status_code=404)
    if payload.decision == "approve":
        from app.services.moderation_service import decide_verification

        decide_verification(db, staff.id, doc, "reopen", payload.note, ip=ip)
        return ActionOut(id=str(doc.id), status="reopened")
    doc.appeal_status = AppealStatus.rejected.value
    doc.appeal_reviewed_at = utcnow()
    doc.reject_reason = f"{doc.reject_reason or ''} | appeal: {payload.note or 'declined'}".strip()
    log_audit(
        db, staff.id, "verification.appeal_reject", "verification_document", doc.id,
        {"appeal_status": "pending"}, {"appeal_status": "rejected"}, ip,
    )
    db.flush()
    return ActionOut(id=str(doc.id), status="appeal_rejected")


@router.post(
    "/users/{user_id}/trust",
    response_model=ActionOut,
    summary="Grant premium verification (paid, staff-reviewed)",
)
def grant_premium(
    user_id: UUID,
    payload: TrustGrantIn,
    db: DbDep,
    staff: StaffUser = Moderator,
    ip: str = Depends(client_ip),
):
    user = db.get(User, user_id)
    if user is None:
        raise AppError("USER_NOT_FOUND", "User not found", status_code=404)
    if user.verification_level != VerificationLevel.ownership.value:
        raise AppError(
            "PREMIUM_REQUIRES_OWNERSHIP",
            "Premium verification requires reviewed ownership documents first",
            status_code=409,
        )
    user.premium_verified_until = utcnow() + timedelta(days=payload.days)
    recompute_level(db, user)
    log_audit(
        db,
        staff.id,
        "trust.premium_grant",
        "user",
        user.id,
        {"verification_level": VerificationLevel.ownership.value},
        {"verification_level": user.verification_level, "days": payload.days, "note": payload.note},
        ip,
    )
    db.flush()
    return ActionOut(id=str(user.id), status=user.verification_level)


# ── payment audit / reconciliation ──────────────────────────────────────────


@router.get(
    "/payment-events",
    response_model=list[PaymentEventOut],
    summary="Append-only payment audit trail",
)
def payment_events(
    db: DbDep,
    staff: StaffUser = Finance,
    event: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
):
    stmt = select(PaymentEvent)
    if event:
        stmt = stmt.where(PaymentEvent.event == event)
    rows = db.execute(stmt.order_by(PaymentEvent.created_at.desc()).limit(limit)).scalars().all()
    return [
        PaymentEventOut(
            id=str(e.id),
            order_id=str(e.order_id) if e.order_id else None,
            event=e.event,
            provider=e.provider,
            gateway_txn_id=e.gateway_txn_id,
            amount=float(e.amount) if e.amount is not None else None,
            payload_sha256=e.payload_sha256,
            detail=e.detail,
            actor=e.actor,
            created_at=e.created_at,
        )
        for e in rows
    ]


@router.get("/reconciliation", response_model=ReconciliationOut, summary="Daily money reconciliation report")
def reconciliation_report(db: DbDep, staff: StaffUser = Finance):
    return ReconciliationOut(**reconciliation(db))

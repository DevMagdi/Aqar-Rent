"""Admin dashboard KPIs + audit log viewer."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select

from app.api.deps import DbDep, require_roles
from app.models.catalog import Listing
from app.models.commerce import AdPeriod, Order, Payment
from app.models.enums import (
    AdPeriodStatus,
    DocStatus,
    ListingStatus,
    OrderStatus,
    PaymentStatus,
    ReportStatus,
    StaffRole,
    UserStatus,
)
from app.models.identity import AuditLog, StaffUser, User, VerificationDocument
from app.models.social import ContactEvent, Report
from app.schemas.admin import AuditLogOut, DashboardOut

router = APIRouter(tags=["admin-dashboard"])


@router.get("/dashboard", response_model=DashboardOut, summary="Dashboard KPIs")
def dashboard(db: DbDep, staff: StaffUser = Depends(require_roles(StaffRole.moderator))) -> DashboardOut:
    users_total = db.execute(select(func.count()).select_from(User)).scalar_one()
    users_banned = db.execute(
        select(func.count()).select_from(User).where(User.status == UserStatus.banned.value)
    ).scalar_one()

    status_rows = db.execute(select(Listing.status, func.count()).group_by(Listing.status)).all()
    listings_by_status = {s: n for s, n in status_rows}
    for s in ListingStatus:
        listings_by_status.setdefault(s.value, 0)

    reports_open = db.execute(
        select(func.count())
        .select_from(Report)
        .where(Report.status.in_([ReportStatus.open.value, ReportStatus.reviewing.value]))
    ).scalar_one()
    verifications_pending = db.execute(
        select(func.count())
        .select_from(VerificationDocument)
        .where(VerificationDocument.status == DocStatus.pending.value)
    ).scalar_one()

    order_rows = db.execute(select(Order.status, func.count()).group_by(Order.status)).all()
    orders_by_status = {s: n for s, n in order_rows}
    for ostatus in OrderStatus:
        orders_by_status.setdefault(ostatus.value, 0)

    revenue = db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.status == PaymentStatus.paid.value)
    ).scalar_one()
    contacts = db.execute(select(func.count()).select_from(ContactEvent)).scalar_one()
    active_ads = db.execute(
        select(func.count()).select_from(AdPeriod).where(AdPeriod.status == AdPeriodStatus.active.value)
    ).scalar_one()

    return DashboardOut(
        users_total=users_total,
        users_banned=users_banned,
        listings_by_status=listings_by_status,
        reports_open=reports_open,
        verifications_pending=verifications_pending,
        orders_by_status=orders_by_status,
        revenue_egp=float(revenue),
        contact_events_total=contacts,
        active_ad_periods=active_ads,
    )


@router.get("/audit-logs", response_model=list[AuditLogOut], summary="Audit trail (super admin)")
def audit_logs(
    db: DbDep,
    staff: StaffUser = Depends(require_roles(StaffRole.super_admin)),
    entity: str | None = None,
    action: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[AuditLogOut]:
    stmt = select(AuditLog)
    if entity:
        stmt = stmt.where(AuditLog.entity == entity)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    rows = db.execute(stmt.order_by(AuditLog.created_at.desc()).limit(limit)).scalars().all()
    return [
        AuditLogOut(
            id=str(r.id),
            staff_id=str(r.staff_id) if r.staff_id else None,
            action=r.action,
            entity=r.entity,
            entity_id=r.entity_id,
            before=r.before,
            after=r.after,
            ip=r.ip,
            created_at=r.created_at,
        )
        for r in rows
    ]

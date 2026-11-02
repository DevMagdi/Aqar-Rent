"""Admin payments: list (filters), revenue, CSV, refunds, bank transfers (finance)."""

from __future__ import annotations

import csv
import io
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select

from app.api.deps import DbDep, SettingsDep, StorageDep, client_ip, require_roles
from app.core.errors import AppError
from app.models.commerce import BankTransfer, Order, Payment, Refund
from app.models.enums import PaymentStatus, RefundStatus, StaffRole
from app.models.identity import StaffUser, User
from app.schemas.admin import (
    BankTransferOut,
    BankTransferRejectIn,
    MethodTotal,
    PaymentOut,
    RefundIn,
    RevenueOut,
    RevenueSlice,
)
from app.schemas.common import ActionOut
from app.services import payment_service
from app.services.common import as_utc
from app.services.moderation_service import log_audit

router = APIRouter(prefix="/payments", tags=["admin-payments"])


def _payment_query(status=None, method=None, owner=None, date_from=None, date_to=None):
    stmt = select(Payment, Order).join(Order, Payment.order_id == Order.id)
    if status:
        stmt = stmt.where(Payment.status == status)
    if method:
        stmt = stmt.where(Payment.method == method)
    if owner:
        needle = f"%{owner}%"
        stmt = stmt.where(or_(User.phone.like(needle), Order.owner_id == _as_uuid(owner))).join(
            User, User.id == Order.owner_id, isouter=True
        )
    if date_from:
        stmt = stmt.where(Payment.created_at >= date_from)
    if date_to:
        stmt = stmt.where(Payment.created_at <= date_to)
    return stmt


def _as_uuid(value: str) -> UUID | None:
    try:
        return UUID(value)
    except ValueError:
        return None


def _payment_rows(db, status=None, limit=50, method=None, owner=None, date_from=None, date_to=None):
    stmt = (
        _payment_query(status, method, owner, date_from, date_to)
        .order_by(Payment.created_at.desc())
        .limit(limit)
    )
    rows = db.execute(stmt).all()
    owners = {}
    if rows:
        owner_ids = {o.owner_id for _p, o in rows}
        owners = {u.id: u for u in db.execute(select(User).where(User.id.in_(owner_ids))).scalars()}
    return [(p, o, owners.get(o.owner_id)) for p, o in rows]


@router.get("", response_model=list[PaymentOut], summary="Payments list (finance)")
def payments_list(
    db: DbDep,
    staff: StaffUser = Depends(require_roles(StaffRole.finance)),
    status: str | None = None,
    method: str | None = None,
    owner: str | None = Query(default=None, description="owner phone (contains) or user id"),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[PaymentOut]:
    return [
        PaymentOut(
            id=str(p.id),
            order_id=str(p.order_id),
            method=p.method,
            amount=float(p.amount),
            status=p.status,
            gateway=order.gateway,
            gateway_txn_id=p.gateway_txn_id,
            owner_phone=u.phone if u else None,
            listing_id=str(order.listing_id) if order.listing_id else None,
            created_at=p.created_at,
        )
        for p, order, u in _payment_rows(db, status, limit, method, owner, date_from, date_to)
    ]


@router.get("/revenue", response_model=RevenueOut, summary="Revenue (paid − refunded)")
def revenue(
    db: DbDep,
    staff: StaffUser = Depends(require_roles(StaffRole.finance)),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> RevenueOut:
    stmt = select(Payment).where(Payment.status.in_([PaymentStatus.paid.value, PaymentStatus.refunded.value]))
    if date_from:
        stmt = stmt.where(Payment.created_at >= date_from)
    if date_to:
        stmt = stmt.where(Payment.created_at <= date_to)
    payments = db.execute(stmt).scalars().all()
    refunded = db.execute(
        select(func.coalesce(func.sum(Refund.amount), 0)).where(Refund.status == RefundStatus.completed.value)
    ).scalar_one()

    total_paid = sum(Decimal(str(p.amount)) for p in payments)
    daily: dict[str, Decimal] = {}
    monthly: dict[str, Decimal] = {}
    by_method: dict[str, Decimal] = {}
    for p in payments:
        created = as_utc(p.created_at) or datetime.now(UTC)
        day = created.date().isoformat()
        month = f"{created.year:04d}-{created.month:02d}"
        daily[day] = daily.get(day, Decimal("0")) + Decimal(str(p.amount))
        monthly[month] = monthly.get(month, Decimal("0")) + Decimal(str(p.amount))
        by_method[p.method] = by_method.get(p.method, Decimal("0")) + Decimal(str(p.amount))

    return RevenueOut(
        total_paid_egp=float(total_paid),
        total_refunded_egp=float(refunded),
        net_egp=float(total_paid - Decimal(str(refunded))),
        count_paid=len(payments),
        daily=[RevenueSlice(bucket=k, total_egp=float(v)) for k, v in sorted(daily.items())],
        monthly=[RevenueSlice(bucket=k, total_egp=float(v)) for k, v in sorted(monthly.items())],
        by_method=[MethodTotal(method=k, total_egp=float(v)) for k, v in sorted(by_method.items())],
    )


@router.get("/export", summary="CSV export of payments")
def export_csv(
    db: DbDep,
    staff: StaffUser = Depends(require_roles(StaffRole.finance)),
    status: str | None = None,
    method: str | None = None,
    owner: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> StreamingResponse:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "payment_id",
            "order_id",
            "method",
            "amount",
            "status",
            "gateway_txn_id",
            "owner_phone",
            "listing_id",
            "created_at",
        ]
    )
    for p, order, u in _payment_rows(db, None, 10_000, method, owner, date_from, date_to):
        if status and p.status != status:
            continue
        writer.writerow(
            [
                p.id,
                p.order_id,
                p.method,
                p.amount,
                p.status,
                p.gateway_txn_id,
                u.phone if u else "",
                order.listing_id,
                p.created_at,
            ]
        )
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="payments.csv"'},
    )


@router.post(
    "/{payment_id}/refund",
    response_model=ActionOut,
    summary="Full/partial refund — calls the gateway, adjusts the ad period (BR-8)",
)
def refund(
    payment_id: UUID,
    payload: RefundIn,
    db: DbDep,
    settings: SettingsDep,
    staff: StaffUser = Depends(require_roles(StaffRole.finance)),
    ip: str = Depends(client_ip),
) -> ActionOut:
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise AppError("PAYMENT_NOT_FOUND", "Payment not found", status_code=404)
    before_status = payment.status
    amount = None if payload.amount is None else Decimal(str(payload.amount))
    payment, _refund_row, _value = payment_service.refund_payment(
        db, settings, payment, staff, amount=amount, reason=payload.reason
    )
    log_audit(
        db,
        staff.id,
        "payment.refund",
        "payment",
        payment.id,
        {"status": before_status},
        {"status": payment.status, "refunded_amount": float(_value)},
        ip,
    )
    return ActionOut(id=str(payment.id), status=payment.status)


# ── bank transfers (manual flow) ─────────────────────────────────────────────

bank_router = APIRouter(prefix="/bank-transfers", tags=["admin-bank-transfers"])


def _transfer_rows(db, status: str | None, limit: int):
    stmt = select(BankTransfer, Order).join(Order, BankTransfer.order_id == Order.id)
    if status:
        stmt = stmt.where(BankTransfer.status == status)
    rows = db.execute(stmt.order_by(BankTransfer.created_at.desc()).limit(limit)).all()
    owners = {}
    if rows:
        owner_ids = {o.owner_id for _t, o in rows}
        owners = {u.id: u for u in db.execute(select(User).where(User.id.in_(owner_ids))).scalars()}
    return rows, owners


@bank_router.get("", response_model=list[BankTransferOut], summary="Bank transfer queue")
def bank_transfers_list(
    db: DbDep,
    storage: StorageDep,
    staff: StaffUser = Depends(require_roles(StaffRole.finance)),
    status: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[BankTransferOut]:
    rows, owners = _transfer_rows(db, status, limit)
    return [
        BankTransferOut(
            id=str(t.id),
            order_id=str(t.order_id),
            listing_id=str(o.listing_id) if o.listing_id else None,
            owner_phone=owners[o.owner_id].phone if o.owner_id in owners else None,
            amount=float(o.total),
            status=t.status,
            reference=o.gateway_ref,
            receipt_url=storage.signed_url(t.receipt_file_key) if t.receipt_file_key else None,
            reject_reason=t.reject_reason,
            created_at=t.created_at,
        )
        for t, o in rows
    ]


@bank_router.post(
    "/{transfer_id}/approve", response_model=ActionOut, summary="Approve transfer → ad goes live"
)
def bank_approve(
    transfer_id: UUID,
    db: DbDep,
    settings: SettingsDep,
    staff: StaffUser = Depends(require_roles(StaffRole.finance)),
    ip: str = Depends(client_ip),
) -> ActionOut:
    transfer = db.get(BankTransfer, transfer_id)
    if transfer is None:
        raise AppError("TRANSFER_NOT_FOUND", "Bank transfer not found", status_code=404)
    order = payment_service.approve_bank_transfer(db, settings, transfer, staff, ip)
    return ActionOut(id=str(order.id), status=order.status)


@bank_router.post(
    "/{transfer_id}/reject",
    response_model=ActionOut,
    summary="Reject transfer → owner may re-upload the receipt",
)
def bank_reject(
    transfer_id: UUID,
    payload: BankTransferRejectIn,
    db: DbDep,
    settings: SettingsDep,
    staff: StaffUser = Depends(require_roles(StaffRole.finance)),
    ip: str = Depends(client_ip),
) -> ActionOut:
    transfer = db.get(BankTransfer, transfer_id)
    if transfer is None:
        raise AppError("TRANSFER_NOT_FOUND", "Bank transfer not found", status_code=404)
    order = payment_service.reject_bank_transfer(db, settings, transfer, staff, payload.reason, ip)
    return ActionOut(id=str(order.id), status=transfer.status)

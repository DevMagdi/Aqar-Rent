"""Admin payments: list, revenue, CSV export, refunds (finance role)."""

from __future__ import annotations

import csv
import io
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select

from app.api.deps import DbDep, client_ip, require_roles
from app.core.errors import AppError
from app.models.commerce import Order, Payment, Refund
from app.models.enums import PaymentStatus, RefundStatus, StaffRole
from app.models.identity import StaffUser, User
from app.schemas.admin import PaymentOut, RefundIn, RevenueOut
from app.schemas.common import ActionOut
from app.services.moderation_service import log_audit

router = APIRouter(prefix="/payments", tags=["admin-payments"])


def _payment_rows(db, status: str | None, limit: int) -> list[tuple[Payment, Order, User | None]]:
    stmt = select(Payment, Order).join(Order, Payment.order_id == Order.id)
    if status:
        stmt = stmt.where(Payment.status == status)
    rows = db.execute(stmt.order_by(Payment.created_at.desc()).limit(limit)).all()
    owners = {}
    if rows:
        owner_ids = {o.owner_id for _p, o in rows}
        owners = {u.id: u for u in db.execute(select(User).where(User.id.in_(owner_ids))).scalars()}
    return [(p, o, owners.get(o.owner_id)) for p, o in rows]


@router.get("", response_model=list[PaymentOut], summary="Payments list")
def payments_list(
    db: DbDep,
    staff: StaffUser = Depends(require_roles(StaffRole.finance)),
    status: str | None = None,
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
            listing_id=str(order.listing_id),
            created_at=p.created_at,
        )
        for p, order, u in _payment_rows(db, status, limit)
    ]


@router.get("/revenue", response_model=RevenueOut, summary="Revenue (paid − refunded)")
def revenue(
    db: DbDep,
    staff: StaffUser = Depends(require_roles(StaffRole.finance)),
) -> RevenueOut:
    paid = db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0), func.count(Payment.id)).where(
            Payment.status == PaymentStatus.paid.value
        )
    ).one()
    refunded = db.execute(
        select(func.coalesce(func.sum(Refund.amount), 0)).where(
            Refund.status == RefundStatus.completed.value
        )
    ).scalar_one()
    return RevenueOut(
        total_paid_egp=float(paid[0]),
        total_refunded_egp=float(refunded),
        net_egp=float(paid[0]) - float(refunded),
        count_paid=int(paid[1]),
    )


@router.get("/export", summary="CSV export of payments")
def export_csv(
    db: DbDep,
    staff: StaffUser = Depends(require_roles(StaffRole.finance)),
) -> StreamingResponse:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        ["payment_id", "order_id", "method", "amount", "status", "gateway_txn_id",
         "owner_phone", "listing_id", "created_at"]
    )
    for p, order, u in _payment_rows(db, None, 10_000):
        writer.writerow(
            [p.id, p.order_id, p.method, p.amount, p.status, p.gateway_txn_id,
             u.phone if u else "", order.listing_id, p.created_at]
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
    summary="Full/partial refund (BR-8)",
)
def refund(
    payment_id: UUID,
    payload: RefundIn,
    db: DbDep,
    staff: StaffUser = Depends(require_roles(StaffRole.finance)),
    ip: str = Depends(client_ip),
) -> ActionOut:
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise AppError("PAYMENT_NOT_FOUND", "Payment not found", status_code=404)
    if payment.status not in (PaymentStatus.paid.value, PaymentStatus.refunded.value):
        raise AppError(
            "INVALID_PAYMENT_STATE",
            "Only paid payments can be refunded",
            status_code=409,
            details={"status": payment.status},
        )
    already = db.execute(
        select(func.coalesce(func.sum(Refund.amount), 0)).where(
            Refund.payment_id == payment.id,
            Refund.status == RefundStatus.completed.value,
        )
    ).scalar_one()
    amount = float(payment.amount) if payload.amount is None else float(payload.amount)
    if amount <= 0 or amount + float(already) > float(payment.amount) + 1e-6:
        raise AppError(
            "INVALID_REFUND_AMOUNT",
            "Refund exceeds the refundable amount",
            status_code=422,
            details={"refundable": float(payment.amount) - float(already)},
        )
    refund_row = Refund(
        payment_id=payment.id,
        amount=amount,
        reason=payload.reason,
        issued_by=staff.id,
        status=RefundStatus.completed.value,
    )
    db.add(refund_row)
    total_refunded = float(already) + amount
    fully = total_refunded >= float(payment.amount) - 1e-6
    if fully:
        payment.status = PaymentStatus.refunded.value
        order = db.get(Order, payment.order_id)
        if order is not None and order.status == "paid":
            from app.models.enums import OrderStatus

            order.status = OrderStatus.refunded.value
    db.flush()
    log_audit(
        db,
        staff.id,
        "payment.refund",
        "payment",
        payment.id,
        {"status": PaymentStatus.paid.value},
        {"status": payment.status, "refunded_amount": amount},
        ip,
    )
    return ActionOut(id=str(payment.id), status=payment.status)

"""Append-only payment audit trail + reconciliation helpers.

Every money-state change records an event with a SHA-256 of the (redacted)
payload. No card data, no OTP, no national IDs are ever stored here.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.commerce import Order, Payment
from app.models.enums import OrderStatus, PaymentStatus
from app.models.growth import PaymentEvent


def record_event(
    db: Session,
    *,
    event: str,
    order: Order | None = None,
    provider: str | None = None,
    txn_id: str | None = None,
    payload: dict[str, Any] | None = None,
    detail: str = "",
    actor: str | None = None,
) -> PaymentEvent:
    digest = None
    if payload is not None:
        canonical = json.dumps(payload, sort_keys=True, default=str, ensure_ascii=False).encode()
        digest = hashlib.sha256(canonical).hexdigest()
    row = PaymentEvent(
        order_id=order.id if order else None,
        event=event,
        provider=provider,
        gateway_txn_id=txn_id,
        amount=float(order.total) if order is not None else None,
        payload_sha256=digest,
        detail=detail[:1000],
        actor=actor,
    )
    db.add(row)
    db.flush()
    return row


def reconciliation(db: Session) -> dict[str, Any]:
    """Ops report: paid orders without payment rows, failed events, mismatches."""
    paid_orders = (
        db.execute(
            select(Order).where(
                Order.status.in_((OrderStatus.paid.value, OrderStatus.refunded.value))
            )
        )
        .scalars()
        .all()
    )
    paid_ids = {o.id for o in paid_orders}
    payments = db.execute(select(Payment)).scalars().all()
    payments_by_order: dict[UUID, int] = {}
    for p in payments:
        payments_by_order[p.order_id] = payments_by_order.get(p.order_id, 0) + 1
    missing_payment = [str(o.id) for o in paid_orders if payments_by_order.get(o.id, 0) == 0]
    orphan_payments = [
        str(p.id)
        for p in payments
        if p.order_id not in paid_ids and p.status == PaymentStatus.paid.value
    ]
    failure_events = db.execute(
        select(func.count())
        .select_from(PaymentEvent)
        .where(
            PaymentEvent.event.in_(
                (
                    "webhook.invalid_signature",
                    "webhook.unknown_order",
                    "webhook.amount_mismatch",
                    "webhook.failure",
                    "checkout.gateway_error",
                    "bank_transfer.rejected",
                )
            )
        )
    ).scalar_one()
    totals = db.execute(
        select(func.sum(Payment.amount)).where(Payment.status == PaymentStatus.paid.value)
    ).scalar_one()
    return {
        "paid_orders": len(paid_orders),
        "paid_payments": len([p for p in payments if p.status == PaymentStatus.paid.value]),
        "collected_egp": float(totals or 0),
        "missing_payment_rows": missing_payment,
        "orphan_paid_payments": orphan_payments,
        "failure_events": int(failure_events),
        "consistent": not missing_payment and not orphan_payments,
    }

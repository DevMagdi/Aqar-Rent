"""Payment orchestration: checkout, webhooks, bank transfers, refunds.

Rules enforced here (on top of BR-1..BR-12):
  * Gateway webhooks are HMAC-verified, idempotent on gateway_txn_id
    (a duplicate or replayed callback NEVER creates two ad periods) and
    applied under a row lock on the order (SELECT … FOR UPDATE).
  * Money is Decimal end-to-end; JSON serialization to float happens only at
    the API boundary (documented in ASSUMPTIONS).
  * Full refunds cancel the order's ad period (BR-8 platform fault); partial
    refunds shorten it proportionally.
"""

from __future__ import annotations

import logging
import uuid
from datetime import timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError
from app.models.catalog import Listing, Plan
from app.models.commerce import AdPeriod, BankTransfer, Order, Payment, Refund
from app.models.enums import (
    AdPeriodStatus,
    BankTransferStatus,
    ListingStatus,
    OrderStatus,
    PaymentStatus,
    RefundStatus,
)
from app.models.identity import User
from app.services.common import as_utc, utcnow
from app.services.listing_service import activate_listing
from app.services.notifications import create_notification, notification_has
from app.services.payments import build_provider, provider_for_webhook
from app.services.payments.base import to_cents

logger = logging.getLogger("aqar.payments")

MANUAL_GATEWAY = "manual"
PROMO_GATEWAY = "promo"


# ── lookups / locking ────────────────────────────────────────────────────────


def order_for_update(db: Session, order_id: uuid.UUID) -> Order | None:
    """Lock the order row (PostgreSQL); SQLite serializes writes anyway."""
    return db.execute(select(Order).where(Order.id == order_id).with_for_update()).scalars().first()


def payment_for_order(db: Session, order_id: uuid.UUID) -> Payment | None:
    return (
        db.execute(
            select(Payment)
            .where(Payment.order_id == order_id)
            .order_by(Payment.created_at.desc(), Payment.id.desc())
            .limit(1)
        )
        .scalars()
        .first()
    )


def _plan_for_order(db: Session, order: Order) -> Plan:
    if order.plan_id is not None:
        plan = db.get(Plan, order.plan_id)
        if plan is not None:
            return plan
    from app.services.order_service import get_default_plan

    return get_default_plan(db)


# ── settlement core (webhook / bank / free-promo all converge here) ──────────


def mark_order_paid(
    db: Session,
    settings: Settings,
    order: Order,
    *,
    provider: str,
    txn_id: str,
    raw: dict[str, Any] | None = None,
) -> bool:
    """Idempotently settle an order: payment row + ad period + notification.

    Returns True when this call actually changed something. Duplicate webhook
    deliveries (same gateway_txn_id) or an already-paid order return False —
    an ad period is NEVER created twice for the same money.
    """
    if txn_id:
        existing = db.execute(select(Payment).where(Payment.gateway_txn_id == txn_id)).scalars().first()
        if existing is not None:
            return False
    if order.status in (OrderStatus.paid.value, OrderStatus.refunded.value):
        return False

    now = utcnow()
    payment = Payment(
        order_id=order.id,
        method=order.method,
        amount=order.total,
        status=PaymentStatus.paid.value,
        gateway_txn_id=txn_id or None,
        raw_webhook=raw,
    )
    db.add(payment)
    order.status = OrderStatus.paid.value
    order.paid_at = now
    if provider:
        order.gateway = provider

    if getattr(order, "kind", "ad_period") == "contract_fee":
        # Phase 4: contract fees settle like any order but NEVER start an ad
        # period (weeks=0, no plan). Notification goes to the payer.
        create_notification(
            db,
            order.owner_id,
            "contract_fee_paid",
            "تم دفع رسوم العقد ✅",
            f"تم استلام رسوم العقد بقيمة {order.total} جنيه.",
            {"order_id": str(order.id)},
        )
        db.flush()
        return True

    listing = db.get(Listing, order.listing_id)
    if listing is not None:
        plan = _plan_for_order(db, order)
        activate_listing(db, listing, plan, order.weeks, order_id=order.id, now=now)
        create_notification(
            db,
            order.owner_id,
            "payment_confirmed",
            "تم تأكيد الدفع ✅",
            f"تم تفعيل إعلان «{listing.title}» لمدة {order.weeks} أسبوع.",
            {"order_id": str(order.id), "listing_id": str(listing.id), "weeks": order.weeks},
        )
    else:  # pragma: no cover - defensive: FK makes this impossible
        logger.warning("order %s has no listing; ad not activated", order.id)
    db.flush()
    return True


def mark_order_failed(
    db: Session,
    order: Order,
    *,
    provider: str,
    txn_id: str,
    raw: dict[str, Any] | None = None,
) -> bool:
    if order.status != OrderStatus.pending.value:
        return False
    db.add(
        Payment(
            order_id=order.id,
            method=order.method,
            amount=order.total,
            status=PaymentStatus.failed.value,
            gateway_txn_id=txn_id or None,
            raw_webhook=raw,
        )
    )
    order.status = OrderStatus.failed.value
    if provider:
        order.gateway = provider
    db.flush()
    return True


def settle_free_order(db: Session, settings: Settings, order: Order) -> bool:
    """100 % discount / free-weeks orders skip the gateway and go live now."""
    return mark_order_paid(
        db,
        settings,
        order,
        provider=PROMO_GATEWAY,
        txn_id=f"FREE-{order.id.hex[:10].upper()}",
        raw={"reason": "full_discount"},
    )


# ── checkout initiation ──────────────────────────────────────────────────────


def initiate_checkout(db: Session, settings: Settings, order: Order, owner: User) -> dict[str, Any]:
    """Bind/refresh the gateway checkout for a pending order.

    Returns {"checkout_url": ..., "payment_reference": ...}. Bank transfers
    already have their instructions; free orders are already settled.
    """
    from app.models.enums import PaymentMethod

    if order.method == PaymentMethod.bank_transfer.value:
        return {"checkout_url": None, "payment_reference": order.gateway_ref}
    if order.status != OrderStatus.pending.value:
        return {"checkout_url": None, "payment_reference": order.gateway_ref}

    provider = build_provider(settings)
    intent = provider.create_payment(order, owner)
    order.gateway = provider.name
    if order.gateway_ref != intent.gateway_ref:
        order.gateway_ref = intent.gateway_ref  # unique per order
    db.flush()
    return {"checkout_url": intent.checkout_url, "payment_reference": intent.reference}


# ── webhook processing ───────────────────────────────────────────────────────


def handle_webhook(
    db: Session,
    settings: Settings,
    query_params: dict[str, str],
    raw_body: bytes,
) -> dict[str, Any]:
    provider = provider_for_webhook(settings, raw_body)
    if provider is None:
        raise AppError("INVALID_WEBHOOK", "Unrecognized webhook payload", status_code=400)
    if not provider.verify_webhook(query_params, raw_body):
        raise AppError("INVALID_SIGNATURE", "Webhook signature verification failed", status_code=401)
    try:
        event = provider.parse_event(query_params, raw_body)
    except ValueError as exc:
        raise AppError("INVALID_WEBHOOK", f"Cannot parse webhook: {exc}", status_code=400) from exc

    order = (
        db.execute(select(Order).where(Order.gateway_ref == event.order_ref).with_for_update())
        .scalars()
        .first()
    )
    if order is None:
        logger.warning("webhook for unknown order_ref=%s txn=%s", event.order_ref, event.gateway_txn_id)
        return {"status": "ignored", "reason": "unknown_order"}

    if event.event == "pending":
        return {"status": "ignored", "reason": "pending"}

    if event.event == "success":
        if event.amount_cents and event.amount_cents != to_cents(order.total):
            logger.warning(
                "webhook amount mismatch order=%s expected=%s got=%s",
                order.id,
                to_cents(order.total),
                event.amount_cents,
            )
            return {"status": "ignored", "reason": "amount_mismatch"}
        changed = mark_order_paid(
            db,
            settings,
            order,
            provider=event.provider,
            txn_id=event.gateway_txn_id,
            raw=event.raw,
        )
        return {"status": "ok" if changed else "duplicate"}

    if event.event == "failure":
        changed = mark_order_failed(
            db, order, provider=event.provider, txn_id=event.gateway_txn_id, raw=event.raw
        )
        return {"status": "ok" if changed else "duplicate"}

    # refunded (gateway-initiated)
    payment = (
        db.execute(select(Payment).where(Payment.gateway_txn_id == event.gateway_txn_id)).scalars().first()
    )
    if payment is None:
        payment = payment_for_order(db, order.id)
    if payment is None or payment.status == PaymentStatus.refunded.value:
        return {"status": "duplicate"}
    payment.status = PaymentStatus.refunded.value
    payment.raw_webhook = event.raw
    if order.status == OrderStatus.paid.value:
        order.status = OrderStatus.refunded.value
    _cancel_ad_periods(db, order, full=True)
    _notify_refund(db, order, Decimal(str(payment.amount)), gateway=True)
    db.flush()
    return {"status": "ok"}


# ── bank transfers (manual) ──────────────────────────────────────────────────


def upload_bank_receipt(
    db: Session,
    settings: Settings,
    storage: Any,
    order: Order,
    data: bytes,
    filename: str,
) -> BankTransfer:
    from app.models.enums import PaymentMethod

    if order.method != PaymentMethod.bank_transfer.value:
        raise AppError(
            "NOT_BANK_TRANSFER",
            "This order is not paid by bank transfer",
            status_code=409,
        )
    if order.status != OrderStatus.pending.value:
        raise AppError(
            "ORDER_NOT_PENDING",
            "Receipts can only be uploaded for pending orders",
            status_code=409,
            details={"status": order.status},
        )
    max_bytes = settings.bank_receipt_max_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise AppError(
            "RECEIPT_TOO_LARGE",
            f"Receipt must be ≤ {settings.bank_receipt_max_mb} MB",
            status_code=413,
        )
    from io import BytesIO

    try:
        from PIL import Image

        with Image.open(BytesIO(data)) as img:
            fmt = (img.format or "").lower()
    except Exception as exc:
        raise AppError(
            "INVALID_RECEIPT",
            "Receipt must be a JPEG, PNG or WebP image",
            status_code=415,
        ) from exc
    if fmt not in ("jpeg", "png", "webp"):
        raise AppError(
            "INVALID_RECEIPT",
            "Receipt must be a JPEG, PNG or WebP image",
            status_code=415,
        )
    ext = "jpg" if fmt == "jpeg" else fmt
    ctype = {"jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}[fmt]
    key = f"bank-receipts/{order.id}/{uuid.uuid4().hex[:10]}.{ext}"
    storage.put(key, data, ctype)

    transfer = db.execute(select(BankTransfer).where(BankTransfer.order_id == order.id)).scalars().first()
    if transfer is None:
        transfer = BankTransfer(order_id=order.id)
        db.add(transfer)
    transfer.receipt_file_key = key
    transfer.status = BankTransferStatus.pending.value
    transfer.reject_reason = None
    db.flush()
    return transfer


def approve_bank_transfer(
    db: Session,
    settings: Settings,
    transfer: BankTransfer,
    staff: Any,
    ip: str | None,
) -> Order:
    from app.services.moderation_service import log_audit

    if transfer.status != BankTransferStatus.pending.value:
        raise AppError(
            "TRANSFER_NOT_PENDING",
            "Only pending bank transfers can be approved",
            status_code=409,
            details={"status": transfer.status},
        )
    if not transfer.receipt_file_key:
        raise AppError(
            "RECEIPT_MISSING",
            "The owner has not uploaded a receipt yet",
            status_code=409,
        )
    order = order_for_update(db, transfer.order_id)
    if order is None or order.status != OrderStatus.pending.value:
        raise AppError(
            "ORDER_NOT_PENDING",
            "Order is not payable any more",
            status_code=409,
            details={"status": order.status if order else None},
        )
    transfer.status = BankTransferStatus.approved.value
    transfer.reviewed_by = staff.id
    mark_order_paid(
        db,
        settings,
        order,
        provider=MANUAL_GATEWAY,
        txn_id=f"BANK-{order.gateway_ref or order.id.hex[:10].upper()}",
        raw={"bank_transfer_id": str(transfer.id), "reviewed_by": str(staff.id)},
    )
    log_audit(
        db,
        staff.id,
        "bank_transfer.approve",
        "bank_transfer",
        transfer.id,
        {"status": BankTransferStatus.pending.value},
        {"status": BankTransferStatus.approved.value, "order_id": str(order.id)},
        ip,
    )
    listing = db.get(Listing, order.listing_id)
    create_notification(
        db,
        order.owner_id,
        "bank_transfer_approved",
        "تم اعتماد حوالة البنك ✅",
        f"تم اعتماد حوالتك وتفعيل إعلان «{listing.title if listing else order.listing_id}».",
        {"order_id": str(order.id), "bank_transfer_id": str(transfer.id)},
    )
    db.flush()
    return order


def reject_bank_transfer(
    db: Session,
    settings: Settings,
    transfer: BankTransfer,
    staff: Any,
    reason: str,
    ip: str | None,
) -> Order:
    from app.services.moderation_service import log_audit

    if transfer.status != BankTransferStatus.pending.value:
        raise AppError(
            "TRANSFER_NOT_PENDING",
            "Only pending bank transfers can be rejected",
            status_code=409,
            details={"status": transfer.status},
        )
    order = db.get(Order, transfer.order_id)
    if order is None:  # pragma: no cover - FK guarantees existence
        raise AppError("ORDER_NOT_FOUND", "Order not found", status_code=404)
    transfer.status = BankTransferStatus.rejected.value
    transfer.reviewed_by = staff.id
    transfer.reject_reason = reason or None
    log_audit(
        db,
        staff.id,
        "bank_transfer.reject",
        "bank_transfer",
        transfer.id,
        {"status": BankTransferStatus.pending.value},
        {"status": BankTransferStatus.rejected.value, "reason": reason},
        ip,
    )
    create_notification(
        db,
        order.owner_id,
        "bank_transfer_rejected",
        "تم رفض حوالة البنك",
        f"تعذر اعتماد حوالتك ({reason or 'بدون سبب'}) — يمكنك رفع إيصال جديد.",
        {"order_id": str(order.id), "bank_transfer_id": str(transfer.id), "reason": reason},
    )
    db.flush()
    return order


# ── refunds (BR-8) ───────────────────────────────────────────────────────────


def _cancel_ad_periods(db: Session, order: Order, *, full: bool, fraction: Decimal | None = None) -> bool:
    """Cancel (full) or shorten (partial) the ad periods paid by this order."""
    periods = (
        db.execute(
            select(AdPeriod).where(
                AdPeriod.order_id == order.id,
                AdPeriod.status == AdPeriodStatus.active.value,
            )
        )
        .scalars()
        .all()
    )
    now = utcnow()
    touched = False
    for period in periods:
        if full:
            period.status = AdPeriodStatus.cancelled.value
            touched = True
            continue
        start, end = as_utc(period.starts_at), as_utc(period.ends_at)
        if start is None or end is None or fraction is None:
            continue
        length = end - start
        new_end = end - timedelta(seconds=length.total_seconds() * float(fraction))
        if new_end <= start or new_end <= now:
            period.status = AdPeriodStatus.ended.value
        else:
            period.ends_at = new_end
        touched = True
    if not touched:
        return False
    listing = db.get(Listing, order.listing_id)
    if listing is not None and listing.status == ListingStatus.active.value:
        still_running = db.execute(
            select(func.count())
            .select_from(AdPeriod)
            .where(
                AdPeriod.listing_id == listing.id,
                AdPeriod.status == AdPeriodStatus.active.value,
                AdPeriod.starts_at <= now,
                AdPeriod.ends_at > now,
            )
        ).scalar_one()
        if still_running == 0:
            listing.status = ListingStatus.expired.value
            if not notification_has(db, listing.owner_id, "ad_expired", "order_id", str(order.id)):
                create_notification(
                    db,
                    listing.owner_id,
                    "ad_expired",
                    "تم إيقاف الإعلان",
                    f"أُوقف إعلان «{listing.title}» بسبب استرجاع الدفع.",
                    {"listing_id": str(listing.id), "order_id": str(order.id)},
                )
    from app.services.listing_service import refresh_ad_rank

    refresh_ad_rank(db, order.listing_id)
    return True


def _notify_refund(db: Session, order: Order, amount: Decimal, *, gateway: bool) -> None:
    create_notification(
        db,
        order.owner_id,
        "refund_issued",
        "تم إرجاع المبلغ 💸",
        f"تم إرجاع {amount} ج.م لطلبك {('عبر بوابة الدفع' if gateway else '')}.",
        {"order_id": str(order.id), "amount_egp": float(amount)},
    )


def refund_payment(
    db: Session,
    settings: Settings,
    payment: Payment,
    staff: Any,
    *,
    amount: Decimal | None,
    reason: str,
) -> tuple[Payment, Refund, Decimal]:
    """Finance/Super-Admin refund: gateway call + order/ad-period effects."""
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
    total = Decimal(str(payment.amount))
    refundable = total - Decimal(str(already))
    value = refundable if amount is None else Decimal(amount)
    if value <= 0 or value > refundable:
        raise AppError(
            "INVALID_REFUND_AMOUNT",
            "Refund exceeds the refundable amount",
            status_code=422,
            details={"refundable": float(refundable)},
        )

    order = db.get(Order, payment.order_id)
    gateway_ref: str | None = None
    provider = build_provider(settings)
    if order is not None and order.gateway == provider.name and payment.gateway_txn_id:
        gateway_ref = provider.refund(payment, value)  # raises AppError on failure

    refund_row = Refund(
        payment_id=payment.id,
        amount=float(value),
        reason=reason,
        issued_by=staff.id,
        status=RefundStatus.completed.value,
        gateway_ref=gateway_ref,
    )
    db.add(refund_row)
    fully = Decimal(str(already)) + value >= total
    if fully:
        payment.status = PaymentStatus.refunded.value
        if order is not None and order.status == OrderStatus.paid.value:
            order.status = OrderStatus.refunded.value
    if order is not None:
        _cancel_ad_periods(db, order, full=fully, fraction=(value / total) if total else None)
        _notify_refund(db, order, value, gateway=gateway_ref is not None)
    db.flush()
    return payment, refund_row, value

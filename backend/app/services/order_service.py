"""Plans, promo codes and order creation.

Business rules:
  BR-1 ad price comes from the `plans` table (never hard-coded)
  BR-2 1..4 consecutive weeks per purchase; total = weeks × plan price (no discount)
  BR-5 payment is requested ONLY after a moderator approves the listing
  BR-9 promo codes: percent or free weeks, max uses, expiry
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError
from app.models.catalog import Listing, Plan
from app.models.commerce import Order, PromoCode
from app.models.enums import ListingStatus, OrderStatus, PaymentMethod, PromoType
from app.models.identity import User
from app.services.common import as_utc, utcnow

BANK_TRANSFER = "bank_transfer"


def get_default_plan(db: Session) -> Plan:
    """The plan used for new ad purchases: active, lowest priority tier first."""
    plan = db.execute(
        select(Plan)
        .where(Plan.active.is_(True))
        .order_by(Plan.priority_weight.asc(), Plan.created_at.asc())
        .limit(1)
    ).scalar_one_or_none()
    if plan is None:
        raise AppError(
            "PLAN_NOT_CONFIGURED",
            "No active advertising plan is configured",
            status_code=400,
        )
    return plan


def compute_totals(plan: Plan, weeks: int, promo: PromoCode | None = None) -> dict[str, float]:
    if weeks < 1 or weeks > 4:
        raise AppError(
            "INVALID_WEEKS",
            "You can buy 1 to 4 consecutive weeks per purchase",
            status_code=422,
            details={"weeks": weeks},
        )
    price = float(plan.price_egp)
    subtotal = round(price * weeks, 2)
    discount = 0.0
    if promo is not None:
        if promo.type == PromoType.percent.value:
            discount = round(subtotal * float(promo.value) / 100.0, 2)
        elif promo.type == PromoType.free_weeks.value:
            free_weeks = min(int(promo.value), weeks)
            discount = round(price * free_weeks, 2)
    discount = min(discount, subtotal)
    return {"subtotal": subtotal, "discount": discount, "total": round(subtotal - discount, 2)}


def validate_promo(
    db: Session, code: str, weeks: int, plan: Plan, *, consume_view: bool = False
) -> tuple[PromoCode | None, dict[str, float]]:
    promo = db.execute(select(PromoCode).where(PromoCode.code == code.upper().strip())).scalar_one_or_none()
    if promo is None or not promo.active:
        raise AppError("PROMO_INVALID", "Promo code is not valid", status_code=400)
    now = utcnow()
    exp = as_utc(promo.expires_at)
    if exp is not None and exp <= now:
        raise AppError("PROMO_EXPIRED", "Promo code has expired", status_code=400)
    if promo.max_uses is not None and promo.used_count >= promo.max_uses:
        raise AppError("PROMO_EXHAUSTED", "Promo code reached its max uses", status_code=400)
    totals = compute_totals(plan, weeks, promo)
    return promo, totals


def create_order(
    db: Session,
    settings: Settings,
    owner: User,
    *,
    listing_id: uuid.UUID,
    weeks: int,
    method: str,
    promo_code: str | None = None,
) -> Order:
    listing = db.get(Listing, listing_id)
    if listing is None or listing.owner_id != owner.id:
        raise AppError("LISTING_NOT_FOUND", "Listing not found", status_code=404)

    # BR-5: payment is only requested after moderator approval. Listings that
    # are Active/Expired were approved before (published) → renewals allowed.
    approved_before = listing.published_at is not None and listing.status in (
        ListingStatus.active.value,
        ListingStatus.expired.value,
    )
    if listing.status != ListingStatus.approved.value and not approved_before:
        raise AppError(
            "ORDER_NOT_APPROVED",
            "Payment can only be requested after the listing is approved by a moderator",
            status_code=409,
            details={"listing_status": listing.status},
        )

    if method not in {m.value for m in PaymentMethod}:
        raise AppError("INVALID_METHOD", "Unsupported payment method", status_code=422)

    plan = get_default_plan(db)  # BR-1
    promo = None
    totals = compute_totals(plan, weeks)  # BR-2 + BR-1 math
    if promo_code:
        promo, totals = validate_promo(db, promo_code, weeks, plan)

    gateway = "manual" if method == BANK_TRANSFER else None  # gateway binding in Phase 2
    order = Order(
        owner_id=owner.id,
        listing_id=listing.id,
        weeks=weeks,
        subtotal=totals["subtotal"],
        discount=totals["discount"],
        total=totals["total"],
        promo_code_id=promo.id if promo else None,
        status=OrderStatus.pending.value,
        method=method,
        gateway=gateway,
        expires_at=utcnow() + timedelta(hours=settings.fawry_expiry_hours)
        if method == PaymentMethod.fawry.value
        else None,
    )
    if promo is not None:
        promo.used_count += 1
    db.add(order)
    db.flush()
    # Unique human reference for bank transfers (owner writes it on the receipt).
    order.gateway_ref = f"AQR-{order.id.hex[:10].upper()}"
    db.flush()
    return order


def order_to_dict(order: Order, settings: Settings) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": str(order.id),
        "listing_id": str(order.listing_id),
        "weeks": order.weeks,
        "subtotal": float(order.subtotal),
        "discount": float(order.discount),
        "total": float(order.total),
        "status": order.status,
        "method": order.method,
        "gateway": order.gateway,
        "gateway_ref": order.gateway_ref,
        "expires_at": order.expires_at,
        "paid_at": order.paid_at,
        "created_at": order.created_at,
        "bank_instructions": None,
    }
    if order.method == BANK_TRANSFER:
        data["bank_instructions"] = {
            "bank_name": settings.bank_name,
            "account_name": settings.bank_account_name,
            "account_number": settings.bank_account_number,
            "iban": settings.bank_iban,
            "swift": settings.bank_swift,
            "reference": order.gateway_ref or "",
        }
    return data

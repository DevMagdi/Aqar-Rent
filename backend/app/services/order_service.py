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

from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError
from app.models.catalog import Listing, Plan
from app.models.commerce import AdPeriod, Order, Payment, PromoCode
from app.models.enums import ListingStatus, OrderStatus, PaymentMethod, PromoType
from app.models.growth import AdPackage
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


def compute_totals(
    plan: Plan, weeks: int, promo: PromoCode | None = None, *, max_weeks: int = 4
) -> dict[str, float]:
    if weeks < 1 or weeks > max_weeks:
        raise AppError(
            "INVALID_WEEKS",
            f"You can buy 1 to {max_weeks} consecutive weeks per purchase",
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
    db: Session, code: str, weeks: int, plan: Plan, *, consume_view: bool = False, max_weeks: int = 4
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
    totals = compute_totals(plan, weeks, promo, max_weeks=max_weeks)
    return promo, totals


def _check_duplicate_pending(db: Session, listing_id: uuid.UUID, method: str) -> None:
    """No second payable order while one is already awaiting payment.

    Card checkouts are ephemeral (an abandoned one is marked failed instead of
    blocking the owner); fawry / wallet / bank references stay payable for 48 h
    (bank: until Finance reviews) and therefore block duplicates.
    """
    from app.models.enums import PaymentMethod as PM

    pending = (
        db.execute(
            select(Order).where(
                Order.listing_id == listing_id,
                Order.status == OrderStatus.pending.value,
            )
        )
        .scalars()
        .all()
    )
    # A payable fawry/wallet/bank reference blocks every new order; card
    # sessions only replace other card sessions.
    if any(o.method != PM.card.value for o in pending):
        blocker = next(o for o in pending if o.method != PM.card.value)
        raise AppError(
            "DUPLICATE_PENDING_ORDER",
            "This listing already has a payment awaiting completion",
            status_code=409,
            details={"pending_order_id": str(blocker.id), "method": blocker.method},
        )
    if method == PM.card.value:
        for order in pending:
            if order.method == PM.card.value:
                order.status = OrderStatus.failed.value
        db.flush()


def _check_running_ad_cap(db: Session, owner: User, listing: Listing) -> None:
    """BR-7 at checkout: at most `listing_cap` (default 5) simultaneously live ads."""
    from app.services.entitlements import effective_listing_cap

    now = utcnow()
    cap = effective_listing_cap(db, owner)
    listing_running = db.execute(
        select(func.count())
        .select_from(AdPeriod)
        .where(
            AdPeriod.listing_id == listing.id,
            AdPeriod.status == "active",
            AdPeriod.starts_at <= now,
            AdPeriod.ends_at > now,
        )
    ).scalar_one()
    if listing_running:
        return  # renewal of a live ad never adds a new listing
    running = db.execute(
        select(func.count(func.distinct(AdPeriod.listing_id)))
        .select_from(AdPeriod)
        .join(Listing, Listing.id == AdPeriod.listing_id)
        .where(
            Listing.owner_id == owner.id,
            AdPeriod.status == "active",
            AdPeriod.starts_at <= now,
            AdPeriod.ends_at > now,
        )
    ).scalar_one()
    if running >= cap:
        raise AppError(
            "LISTING_CAP_REACHED",
            f"You reached the maximum of {cap} active listings",
            status_code=409,
            details={"cap": cap, "current": int(running)},
        )


def create_order(
    db: Session,
    settings: Settings,
    owner: User,
    *,
    listing_id: uuid.UUID,
    weeks: int,
    method: str,
    promo_code: str | None = None,
    package_id: uuid.UUID | None = None,
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

    _check_duplicate_pending(db, listing.id, method)
    _check_running_ad_cap(db, owner, listing)  # BR-7

    plan = get_default_plan(db)  # BR-1
    promo = None
    package = None
    max_weeks = 4  # BR-2 baseline
    if package_id is not None:
        package = db.get(AdPackage, package_id)
        if package is None or not package.active:
            raise AppError("PACKAGE_NOT_FOUND", "Ad package not found", status_code=404)
        if package.weeks != weeks:
            raise AppError(
                "PACKAGE_WEEKS_MISMATCH",
                "weeks must equal the package duration",
                status_code=422,
                details={"package_weeks": package.weeks, "weeks": weeks},
            )
        max_weeks = 52
    totals = compute_totals(plan, weeks, max_weeks=max_weeks)  # BR-2 + BR-1 math
    if promo_code:
        promo, promo_totals = validate_promo(db, promo_code, weeks, plan, max_weeks=max_weeks)
        totals["discount"] = promo_totals["discount"]
        totals["total"] = promo_totals["total"]
    if package is not None:
        from decimal import Decimal

        package_discount = float(
            (Decimal(str(totals["subtotal"])) * Decimal(str(package.discount_pct)) / Decimal("100"))
            .quantize(Decimal("0.01"))
        )
        totals["discount"] = round(min(totals["discount"] + package_discount, totals["subtotal"]), 2)
        totals["total"] = round(totals["subtotal"] - totals["discount"], 2)

    gateway = "manual" if method == BANK_TRANSFER else None
    expires_at = None
    if method in (PaymentMethod.fawry.value, PaymentMethod.vodafone_cash.value):
        expires_at = utcnow() + timedelta(hours=settings.fawry_expiry_hours)
    order = Order(
        owner_id=owner.id,
        listing_id=listing.id,
        weeks=weeks,
        subtotal=totals["subtotal"],
        discount=totals["discount"],
        total=totals["total"],
        promo_code_id=promo.id if promo else None,
        plan_id=plan.id,  # BR-1: which plan priced this order
        ad_package_id=package.id if package else None,
        status=OrderStatus.pending.value,
        method=method,
        gateway=gateway,
        expires_at=expires_at,
    )
    if promo is not None:
        _consume_promo(db, promo)
    db.add(order)
    db.flush()
    # Unique human reference for bank transfers (owner writes it on the receipt).
    order.gateway_ref = f"AQR-{order.id.hex[:10].upper()}"
    db.flush()

    if totals["total"] <= 0:
        # 100 % discount / free-weeks: skip the gateway, go live immediately.
        from app.services.payment_service import settle_free_order

        settle_free_order(db, settings, order)
        db.flush()
    return order


def _consume_promo(db: Session, promo: PromoCode) -> None:
    """Atomic used_count increment — no overuse under concurrency (BR-9).

    The UPDATE re-checks max_uses/expiry/active in the WHERE clause, so two
    concurrent orders can never both take the last redemption.
    """
    now = utcnow()
    exp = as_utc(promo.expires_at) if promo.expires_at is not None else None
    if exp is not None and exp <= now:
        raise AppError("PROMO_EXPIRED", "Promo code has expired", status_code=400)
    result = db.execute(
        update(PromoCode)
        .where(
            PromoCode.id == promo.id,
            PromoCode.active.is_(True),
            or_(PromoCode.max_uses.is_(None), PromoCode.used_count < PromoCode.max_uses),
        )
        .values(used_count=PromoCode.used_count + 1)
        .execution_options(synchronize_session=False)
    )
    if not int(getattr(result, "rowcount", 0) or 0):
        raise AppError("PROMO_EXHAUSTED", "Promo code reached its max uses", status_code=400)
    db.expire(promo, ["used_count"])


def order_to_dict(
    order: Order,
    settings: Settings,
    *,
    db: Any = None,
    checkout: dict[str, Any] | None = None,
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": str(order.id),
        "listing_id": str(order.listing_id) if order.listing_id is not None else None,
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
        "plan_id": str(order.plan_id) if order.plan_id else None,
        "kind": getattr(order, "kind", "ad_period"),
        "package_id": str(order.ad_package_id) if getattr(order, "ad_package_id", None) else None,
        "subscription_plan_id": str(order.subscription_plan_id)
        if getattr(order, "subscription_plan_id", None)
        else None,
        "checkout_url": (checkout or {}).get("checkout_url"),
        "payment_reference": (checkout or {}).get("payment_reference"),
        "receipt_ready": False,
    }
    if db is not None:
        payment = (
            db.execute(
                select(Payment)
                .where(Payment.order_id == order.id)
                .order_by(Payment.created_at.desc())
                .limit(1)
            )
            .scalars()
            .first()
        )
        data["receipt_ready"] = bool(payment and payment.receipt_key and order.status in ("paid", "refunded"))
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

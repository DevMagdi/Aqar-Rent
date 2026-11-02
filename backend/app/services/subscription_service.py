"""Recurring plans, ad packages and paid subscription activation.

Subscriptions are ordinary `orders` with `kind=subscription` and a NULL
listing_id, so they inherit the existing Paymob checkout, HMAC-verified
webhook, idempotency, bank-transfer approval, refund and Arabic receipt paths.
No second payment stack, no mock-only production flow.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError
from app.models.catalog import Plan
from app.models.commerce import Order
from app.models.enums import OrderKind, OrderStatus, PaymentMethod, SubscriptionAudience, SubscriptionStatus
from app.models.growth import AdPackage, Subscription, SubscriptionPlan
from app.models.identity import User
from app.services.common import as_utc, utcnow
from app.services.office_service import office_for_user
from app.services.order_service import get_default_plan

SUBSCRIPTION_DAYS = 30


def plan_price(plan: SubscriptionPlan) -> Decimal:
    return Decimal(str(plan.monthly_price_egp)).quantize(Decimal("0.01"))


def package_totals(db: Session, package: AdPackage) -> dict[str, Any]:
    base = get_default_plan(db)
    subtotal = (Decimal(str(base.price_egp)) * package.weeks).quantize(Decimal("0.01"))
    discount = (subtotal * Decimal(str(package.discount_pct)) / Decimal("100")).quantize(Decimal("0.01"))
    return {
        "weeks": package.weeks,
        "subtotal": float(subtotal),
        "discount": float(discount),
        "total": float(subtotal - discount),
        "priority_weight": package.priority_weight,
    }


def pricing_catalog(db: Session) -> dict[str, Any]:
    """Single payload for the public pricing page (web + mobile + admin preview)."""
    plans = (
        db.execute(select(Plan).where(Plan.active.is_(True)).order_by(Plan.priority_weight, Plan.created_at))
        .scalars()
        .all()
    )
    packages = (
        db.execute(select(AdPackage).where(AdPackage.active.is_(True)).order_by(AdPackage.weeks))
        .scalars()
        .all()
    )
    subs = (
        db.execute(
            select(SubscriptionPlan)
            .where(SubscriptionPlan.active.is_(True))
            .order_by(SubscriptionPlan.audience, SubscriptionPlan.monthly_price_egp)
        )
        .scalars()
        .all()
    )
    weekly = get_default_plan(db)
    return {
        "currency": "EGP",
        "weekly_ad": {
            "id": str(weekly.id),
            "price_egp": float(weekly.price_egp),
            "duration_days": weekly.duration_days,
            "priority_weight": weekly.priority_weight,
        },
        "ad_plans": [
            {
                "id": str(p.id),
                "name": p.name,
                "price_egp": float(p.price_egp),
                "duration_days": p.duration_days,
                "priority_weight": p.priority_weight,
            }
            for p in plans
        ],
        "packages": [
            {
                "id": str(p.id),
                "code": p.code,
                "name_ar": p.name_ar,
                "name_en": p.name_en,
                "weeks": p.weeks,
                "discount_pct": float(p.discount_pct),
                "is_featured": p.is_featured,
                "priority_weight": p.priority_weight,
                **package_totals(db, p),
            }
            for p in packages
        ],
        "subscriptions": [subscription_plan_dict(p) for p in subs],
        "principles": {
            "no_rent_money": True,
            "no_deposits": True,
            "no_commission_on_rent": True,
            "broker_optional": True,
            "note_ar": (
                "المنصة لا تحصّل الإيجار أو التأمين أو عمولة على الإيجار. "
                "المكاتب تسجّل عمولتها الخاصة خارج المنصة."
            ),
            "note_en": (
                "The platform never collects rent, deposits or rent commission. "
                "Offices record their own private commission outside the platform."
            ),
        },
    }


def subscription_plan_dict(plan: SubscriptionPlan) -> dict[str, Any]:
    return {
        "id": str(plan.id),
        "code": plan.code,
        "audience": plan.audience,
        "name_ar": plan.name_ar,
        "name_en": plan.name_en,
        "monthly_price_egp": float(plan.monthly_price_egp),
        "listing_limit": plan.listing_limit,
        "seats": plan.seats,
        "priority_weight": plan.priority_weight,
        "features": plan.features or {},
        "active": plan.active,
    }


def create_subscription_order(
    db: Session,
    settings: Settings,
    user: User,
    *,
    plan_id: UUID,
    method: str,
) -> Order:
    plan = db.get(SubscriptionPlan, plan_id)
    if plan is None or not plan.active:
        raise AppError("PLAN_NOT_FOUND", "Subscription plan not found", status_code=404)
    if method not in {m.value for m in PaymentMethod}:
        raise AppError("INVALID_METHOD", "Unsupported payment method", status_code=422)
    expected = (
        SubscriptionAudience.office.value
        if user.account_type == "office"
        else SubscriptionAudience.individual.value
    )
    if plan.audience != expected:
        raise AppError(
            "PLAN_AUDIENCE_MISMATCH",
            "This plan is for a different account type",
            status_code=409,
            details={"plan_audience": plan.audience, "account_type": user.account_type},
        )
    pending = db.execute(
        select(Order).where(
            Order.owner_id == user.id,
            Order.kind == OrderKind.subscription.value,
            Order.status == OrderStatus.pending.value,
        )
    ).scalars().first()
    if pending is not None and pending.method != PaymentMethod.card.value:
        raise AppError(
            "DUPLICATE_PENDING_ORDER",
            "A subscription payment is already awaiting completion",
            status_code=409,
            details={"pending_order_id": str(pending.id)},
        )
    if pending is not None:
        pending.status = OrderStatus.failed.value
        db.flush()

    total = plan_price(plan)
    order = Order(
        owner_id=user.id,
        listing_id=None,
        weeks=0,
        subtotal=total,
        discount=0,
        total=total,
        status=OrderStatus.pending.value,
        kind=OrderKind.subscription.value,
        method=method,
        gateway="manual" if method == PaymentMethod.bank_transfer.value else None,
        subscription_plan_id=plan.id,
    )
    db.add(order)
    db.flush()
    order.gateway_ref = f"AQR-SUB-{order.id.hex[:10].upper()}"
    if method in (PaymentMethod.fawry.value, PaymentMethod.vodafone_cash.value):
        order.expires_at = utcnow() + timedelta(hours=settings.fawry_expiry_hours)
    db.flush()
    return order


def activate_subscription(db: Session, order: Order) -> Subscription | None:
    """Idempotently activate/extend the plan paid by `order`."""
    if order.kind != OrderKind.subscription.value or order.subscription_plan_id is None:
        return None
    existing = db.execute(
        select(Subscription).where(Subscription.order_id == order.id)
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    plan = db.get(SubscriptionPlan, order.subscription_plan_id)
    if plan is None:  # pragma: no cover - FK protects this
        return None
    now = utcnow()
    current = (
        db.execute(
            select(Subscription).where(
                Subscription.user_id == order.owner_id,
                Subscription.status == SubscriptionStatus.active.value,
            )
            .order_by(Subscription.ends_at.desc())
        )
        .scalars()
        .first()
    )
    start: Any = now
    current_end = as_utc(current.ends_at) if current is not None else None
    if current is not None and current_end is not None and current_end > now:
        start = current_end
        current.status = SubscriptionStatus.expired.value
    office = None
    payer = db.get(User, order.owner_id)
    if payer is not None:
        office = office_for_user(db, payer)
    sub = Subscription(
        user_id=order.owner_id,
        office_id=office.id if office else None,
        plan_id=plan.id,
        order_id=order.id,
        status=SubscriptionStatus.active.value,
        starts_at=now,
        ends_at=start + timedelta(days=SUBSCRIPTION_DAYS),
        auto_renew=False,
    )
    db.add(sub)
    db.flush()
    return sub


def expire_subscriptions(db: Session) -> int:
    now = utcnow()
    stale = (
        db.execute(
            select(Subscription).where(
                Subscription.status == SubscriptionStatus.active.value,
                Subscription.ends_at <= now,
            )
        )
        .scalars()
        .all()
    )
    for sub in stale:
        sub.status = SubscriptionStatus.expired.value
    if stale:
        db.flush()
    return len(stale)


def cancel_subscription(db: Session, sub: Subscription, user: User) -> Subscription:
    if sub.user_id != user.id:
        raise AppError("SUBSCRIPTION_NOT_FOUND", "Subscription not found", status_code=404)
    if sub.status != SubscriptionStatus.active.value:
        raise AppError("INVALID_STATE", "Subscription is not active", status_code=409)
    # Cancellation stops auto-renewal; benefits continue until the paid end date.
    sub.auto_renew = False
    sub.cancelled_at = utcnow()
    sub.status = SubscriptionStatus.cancelled.value
    db.flush()
    return sub


def activation_hint() -> dict[str, str]:
    """Honest copy for clients: no claim of auto-charging a stored card."""
    return {
        "ar": "كل شهر يُنشأ طلب دفع جديد عبر بوابة الدفع؛ لا نحتفظ ببيانات بطاقتك ولا نخصم تلقائياً.",
        "en": "Each month creates a new gateway payment request; we never store card data or auto-charge.",
    }

"""Recurring owner / office subscriptions — real payment paths only.

Checkout creates an `order` (kind=subscription) and goes through the same
Paymob (or dev mock) gateway + HMAC webhook + idempotency + refund + Arabic
receipt pipeline as ad purchases. Production boot refuses mock providers.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter
from fastapi import status as http_status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbDep, SettingsDep
from app.core.errors import AppError
from app.core.rate_limit import check_rate_limit
from app.models.commerce import Order
from app.models.enums import OrderKind, SubscriptionStatus
from app.models.growth import Subscription, SubscriptionPlan
from app.schemas.common import ActionOut
from app.schemas.growth import SubscriptionOrderIn, SubscriptionOut, SubscriptionPlanOut
from app.schemas.orders import OrderOut
from app.services import payment_service
from app.services.order_service import order_to_dict
from app.services.subscription_service import (
    activation_hint,
    cancel_subscription,
    create_subscription_order,
    subscription_plan_dict,
)

router = APIRouter(tags=["subscriptions"])


def _plan_out(sub: Subscription, db) -> SubscriptionOut:
    plan = db.get(SubscriptionPlan, sub.plan_id)
    return SubscriptionOut(
        id=str(sub.id),
        plan_id=str(sub.plan_id),
        status=sub.status,
        starts_at=sub.starts_at,
        ends_at=sub.ends_at,
        auto_renew=sub.auto_renew,
        cancelled_at=sub.cancelled_at,
        plan=SubscriptionPlanOut(**subscription_plan_dict(plan)) if plan else None,
    )


@router.post(
    "/subscriptions/checkout",
    response_model=OrderOut,
    status_code=http_status.HTTP_201_CREATED,
    summary="Buy/renew a monthly plan (Paymob card/wallet/Fawry or bank transfer)",
)
def subscription_checkout(
    payload: SubscriptionOrderIn, user: CurrentUser, db: DbDep, settings: SettingsDep
) -> OrderOut:
    check_rate_limit(
        f"subscriptions:{user.id}", settings.subscription_rate_limit_per_hour, 3600
    )
    order = create_subscription_order(
        db, settings, user, plan_id=payload.plan_id, method=payload.method
    )
    checkout = payment_service.initiate_checkout(db, settings, order, user)
    return OrderOut(**order_to_dict(order, settings, db=db, checkout=checkout))


@router.get("/subscriptions/me", response_model=list[SubscriptionOut], summary="My subscriptions")
def my_subscriptions(user: CurrentUser, db: DbDep) -> list[SubscriptionOut]:
    rows = (
        db.execute(
            select(Subscription)
            .where(Subscription.user_id == user.id)
            .order_by(Subscription.created_at.desc())
            .limit(50)
        )
        .scalars()
        .all()
    )
    return [_plan_out(s, db) for s in rows]


@router.get("/subscriptions/active", response_model=SubscriptionOut | None, summary="Current active plan")
def active_plan(user: CurrentUser, db: DbDep) -> SubscriptionOut | None:
    from app.services.entitlements import active_subscription

    sub = active_subscription(db, user)
    return _plan_out(sub, db) if sub else None


@router.post(
    "/subscriptions/{subscription_id}/cancel",
    response_model=ActionOut,
    summary="Cancel auto-renewal (benefits stay until the paid end date)",
)
def cancel(subscription_id: UUID, user: CurrentUser, db: DbDep) -> ActionOut:
    sub = db.get(Subscription, subscription_id)
    if sub is None or sub.user_id != user.id:
        raise AppError("SUBSCRIPTION_NOT_FOUND", "Subscription not found", status_code=404)
    sub = cancel_subscription(db, sub, user)
    return ActionOut(id=str(sub.id), status=sub.status)


@router.get("/subscriptions/orders", response_model=list[OrderOut], summary="My subscription invoices")
def subscription_orders(user: CurrentUser, db: DbDep, settings: SettingsDep) -> list[OrderOut]:
    rows = (
        db.execute(
            select(Order)
            .where(Order.owner_id == user.id, Order.kind == OrderKind.subscription.value)
            .order_by(Order.created_at.desc())
            .limit(50)
        )
        .scalars()
        .all()
    )
    return [OrderOut(**order_to_dict(o, settings, db=db)) for o in rows]


@router.get("/subscriptions/status", summary="Subscription status + activation hint (honest copy)")
def subscription_status(user: CurrentUser, db: DbDep) -> dict:
    from app.services.entitlements import active_subscription

    sub = active_subscription(db, user)
    return {
        "active": sub is not None,
        "status": sub.status if sub else SubscriptionStatus.expired.value,
        "ends_at": sub.ends_at.isoformat() if sub and sub.ends_at else None,
        "hint": activation_hint(),
        "note_ar": "الاشتراك يمنح حدوداً وأدوات أعلى للإعلانات فقط، ولا يتعلق بتحصيل الإيجار أو التأمين.",
        "note_en": "Subscriptions raise listing limits and provide tools only — never rent or deposits.",
    }

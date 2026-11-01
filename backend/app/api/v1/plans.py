"""Plans (public), orders (BR-1/2/5), promo validation."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter
from fastapi import status as http_status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbDep, SettingsDep
from app.core.errors import AppError
from app.core.rate_limit import check_rate_limit
from app.models.catalog import Plan
from app.models.commerce import Order
from app.schemas.orders import (
    OrderCreateIn,
    OrderOut,
    PlanOut,
    PromoValidateIn,
    PromoValidateOut,
)
from app.services import payment_service
from app.services.order_service import (
    create_order,
    get_default_plan,
    order_to_dict,
    validate_promo,
)

router = APIRouter(tags=["plans & orders"])


@router.get("/plans", response_model=list[PlanOut], summary="Active ad plans (Public)")
def list_plans(db: DbDep) -> list[PlanOut]:
    """BR-1: prices live in the plans table — never hard-coded in the client."""
    rows = (
        db.execute(select(Plan).where(Plan.active.is_(True)).order_by(Plan.priority_weight, Plan.created_at))
        .scalars()
        .all()
    )
    return [
        PlanOut(
            id=str(p.id),
            name=p.name,
            price_egp=float(p.price_egp),
            duration_days=p.duration_days,
            priority_weight=p.priority_weight,
        )
        for p in rows
    ]


@router.post(
    "/orders",
    response_model=OrderOut,
    status_code=http_status.HTTP_201_CREATED,
    summary="Create an order (only after moderator approval — BR-5)",
)
def post_order(payload: OrderCreateIn, user: CurrentUser, db: DbDep, settings: SettingsDep) -> OrderOut:
    check_rate_limit(f"orders:{user.id}", settings.order_rate_limit_per_hour, 3600)
    order = create_order(
        db,
        settings,
        user,
        listing_id=payload.listing_id,
        weeks=payload.weeks,
        method=payload.method.value,
        promo_code=payload.promo_code,
    )
    checkout = payment_service.initiate_checkout(db, settings, order, user)
    return OrderOut(**order_to_dict(order, settings, db=db, checkout=checkout))


@router.get("/orders/{order_id}", response_model=OrderOut, summary="Order detail (owner)")
def get_order(order_id: UUID, user: CurrentUser, db: DbDep, settings: SettingsDep) -> OrderOut:
    order = db.get(Order, order_id)
    if order is None or order.owner_id != user.id:
        raise AppError("ORDER_NOT_FOUND", "Order not found", status_code=404)
    return OrderOut(**order_to_dict(order, settings, db=db))


@router.post("/promo/validate", response_model=PromoValidateOut, summary="Validate a promo code")
def promo_validate(payload: PromoValidateIn, user: CurrentUser, db: DbDep) -> PromoValidateOut:
    plan = get_default_plan(db)
    subtotal = totals_subtotal(db, payload.weeks, plan)
    try:
        promo, totals = validate_promo(db, payload.code, payload.weeks, plan)
    except AppError as exc:
        return PromoValidateOut(
            valid=False,
            code=payload.code.upper().strip(),
            discount=0,
            subtotal=subtotal,
            total=subtotal,
            message=exc.message,
        )
    return PromoValidateOut(
        valid=True,
        code=promo.code if promo else payload.code.upper().strip(),
        discount=totals["discount"],
        subtotal=totals["subtotal"],
        total=totals["total"],
    )


def totals_subtotal(db, weeks: int, plan) -> float:
    from app.services.order_service import compute_totals

    return compute_totals(plan, weeks)["subtotal"]

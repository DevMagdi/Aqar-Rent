"""Phase 5 entitlements: what an account may do right now.

Single source of truth for listing caps, team seats, priority and features.
Used by listing creation, checkout, office invites and every client's
`GET /me/entitlements`, so web/admin/mobile cannot disagree.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.enums import SubscriptionStatus, VerificationLevel
from app.models.growth import OfficeMember, Subscription, SubscriptionPlan
from app.models.identity import User
from app.services.common import as_utc, utcnow
from app.services.listing_service import DEFAULT_LISTING_CAP

INDIVIDUAL_FEATURES: dict[str, bool] = {
    "analytics": False,
    "bulk_tools": False,
    "priority_support": False,
    "team": False,
    "leads": False,
    "branded_page": False,
    "commission_tracking": False,
}


def now_or_never() -> Any:
    return utcnow()


def active_subscriptions(db: Session, user: User) -> list[Subscription]:
    """Paid, unexpired subscriptions of the user OR of an office they belong to."""
    now = utcnow()
    office_ids = [
        m.office_id
        for m in db.execute(
            select(OfficeMember).where(
                OfficeMember.user_id == user.id,
                OfficeMember.status == "active",
            )
        ).scalars()
    ]
    clauses = [Subscription.user_id == user.id]
    if office_ids:
        clauses.append(Subscription.office_id.in_(office_ids))
    rows = (
        db.execute(
            select(Subscription).where(
                Subscription.status == SubscriptionStatus.active.value,
                or_(*clauses),
            )
        )
        .scalars()
        .all()
    )
    out: list[Subscription] = []
    for sub in rows:
        ends = as_utc(sub.ends_at)
        if ends is None or ends > now:
            out.append(sub)
    return out


def active_subscription(db: Session, user: User) -> Subscription | None:
    subs = active_subscriptions(db, user)
    if not subs:
        return None
    return max(subs, key=lambda s: (as_utc(s.ends_at) or now_or_never()))


def effective_listing_cap(db: Session, user: User) -> int:
    """BR-7 with plans: admin override > subscribed limit > default 5."""
    if user.listing_cap is not None:
        return int(user.listing_cap)
    cap = DEFAULT_LISTING_CAP
    for sub in active_subscriptions(db, user):
        plan = db.get(SubscriptionPlan, sub.plan_id)
        if plan is not None:
            cap = max(cap, int(plan.listing_limit))
    return cap


def seat_limit(db: Session, user: User) -> int:
    # Offices get 3 usable seats even on the free tier (owner + 2 agents);
    # paid office subscriptions raise this to 10 / 50.
    limit = 3 if user.account_type == "office" else 1
    for sub in active_subscriptions(db, user):
        plan = db.get(SubscriptionPlan, sub.plan_id)
        if plan is not None:
            limit = max(limit, int(plan.seats))
    return limit


def priority_weight(db: Session, user: User) -> int:
    weight = 0
    for sub in active_subscriptions(db, user):
        plan = db.get(SubscriptionPlan, sub.plan_id)
        if plan is not None:
            weight = max(weight, int(plan.priority_weight))
    return weight


def features_for(db: Session, user: User) -> dict[str, bool]:
    features = dict(INDIVIDUAL_FEATURES)
    for sub in active_subscriptions(db, user):
        plan = db.get(SubscriptionPlan, sub.plan_id)
        if plan is None:
            continue
        for key, value in (plan.features or {}).items():
            if value:
                features[key] = True
    return features


def entitlements(db: Session, user: User) -> dict[str, Any]:
    from app.services.trust_service import trust_snapshot

    subs = active_subscriptions(db, user)
    plans = [db.get(SubscriptionPlan, s.plan_id) for s in subs]
    active_plan = max(
        (p for p in plans if p is not None),
        key=lambda p: int(p.listing_limit),
        default=None,
    )
    return {
        "account_type": user.account_type,
        "verification_level": user.verification_level,
        "trust": trust_snapshot(db, user),
        "listing_cap": effective_listing_cap(db, user),
        "seat_limit": seat_limit(db, user),
        "priority_weight": priority_weight(db, user),
        "features": features_for(db, user),
        "subscription": (
            {
                "id": str(subs[-1].id),
                "status": subs[-1].status,
                "ends_at": subs[-1].ends_at.isoformat() if subs[-1].ends_at else None,
                "plan_code": active_plan.code if active_plan else None,
                "plan_name_ar": active_plan.name_ar if active_plan else None,
                "auto_renew": subs[-1].auto_renew,
            }
            if subs
            else None
        ),
        "is_premium": user.verification_level == VerificationLevel.premium.value,
    }

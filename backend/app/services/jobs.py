"""Hourly scheduled jobs (spec §SCHEDULED JOBS).

1. End ad periods past ends_at → listings become Expired and disappear from search.
2. Expire pending Fawry orders after 48 hours.
3. Send "ad ends in 2 days" reminders.
4. Auto-send a listing to moderation when 3 distinct users report it.

All jobs are plain functions so tests can call them directly; `app.worker`
wraps them for ARQ (runs hourly in docker-compose).
"""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.catalog import Listing
from app.models.commerce import AdPeriod, Order
from app.models.enums import AdPeriodStatus, ListingStatus, OrderStatus, PaymentMethod, ReportStatus
from app.models.identity import User
from app.models.social import Report
from app.services.common import as_utc, utcnow
from app.services.moderation_service import auto_submit_reported_listing
from app.services.notifications import create_notification, notification_has

REMINDER_WINDOW = timedelta(days=2)


def end_expired_ad_periods(db: Session, now=None) -> int:
    """BR-3: past ends_at the listing is Expired and hidden from search."""
    now = now or utcnow()
    stale = (
        db.execute(
            select(AdPeriod).where(
                AdPeriod.status == AdPeriodStatus.active.value,
                AdPeriod.ends_at <= now,
            )
        )
        .scalars()
        .all()
    )
    for period in stale:
        period.status = AdPeriodStatus.ended.value
        listing = db.get(Listing, period.listing_id)
        if listing is None or listing.status != ListingStatus.active.value:
            continue
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
    db.flush()
    return len(stale)


def expire_pending_fawry_orders(db: Session, now=None) -> int:
    now = now or utcnow()
    orders = (
        db.execute(
            select(Order).where(
                Order.status == OrderStatus.pending.value,
                Order.method == PaymentMethod.fawry.value,
            )
        )
        .scalars()
        .all()
    )
    count = 0
    for order in orders:
        created = as_utc(order.created_at)
        fallback = created + timedelta(hours=48) if created else None
        expiry = as_utc(order.expires_at) or fallback
        if expiry is not None and expiry <= now:
            order.status = OrderStatus.expired.value
            count += 1
    db.flush()
    return count


def send_ad_ending_reminders(db: Session, now=None) -> int:
    now = now or utcnow()
    window_start = now + REMINDER_WINDOW - timedelta(minutes=30)
    window_end = now + REMINDER_WINDOW + timedelta(minutes=30)
    periods = (
        db.execute(
            select(AdPeriod).where(
                AdPeriod.status == AdPeriodStatus.active.value,
                AdPeriod.ends_at > window_start,
                AdPeriod.ends_at <= window_end,
            )
        )
        .scalars()
        .all()
    )
    count = 0
    for period in periods:
        listing = db.get(Listing, period.listing_id)
        if listing is None:
            continue
        if notification_has(db, listing.owner_id, "ad_ending_soon", "ad_period_id", str(period.id)):
            continue
        ends = as_utc(period.ends_at)
        days_left = max(0, (ends - now).days) if ends else 2
        create_notification(
            db,
            listing.owner_id,
            "ad_ending_soon",
            "إعلانك ينتهي قريباً",
            f"انتهاء إعلان «{listing.title}» خلال {days_left} يوم — جدد ليظل ظاهراً.",
            {"ad_period_id": str(period.id), "listing_id": str(listing.id), "days_left": days_left},
        )
        count += 1
    db.flush()
    return count


def auto_moderate_reported_listings(db: Session) -> int:
    """Listings with ≥3 distinct open reporters are pushed back to moderation."""
    rows = db.execute(
        select(Report.listing_id, func.count(func.distinct(Report.reporter_id)))
        .where(Report.status.in_([ReportStatus.open.value, ReportStatus.reviewing.value]))
        .group_by(Report.listing_id)
        .having(func.count(func.distinct(Report.reporter_id)) >= 3)
    ).all()
    count = 0
    for listing_id, _n in rows:
        if auto_submit_reported_listing(db, listing_id):
            count += 1
    db.flush()
    return count


def run_hourly_jobs(db: Session, now=None) -> dict[str, int]:
    result = {
        "ended_ad_periods": end_expired_ad_periods(db, now),
        "expired_orders": expire_pending_fawry_orders(db, now),
        "reminders_sent": send_ad_ending_reminders(db, now),
        "auto_moderated": auto_moderate_reported_listings(db),
    }
    return result


_ = User  # keep import surface explicit for future job extensions

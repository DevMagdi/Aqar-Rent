"""Hourly scheduled jobs (spec §SCHEDULED JOBS).

1. End ad periods past ends_at → listings become Expired and disappear from search
   (+ "ad expired" notification to the owner).
2. Expire pending Fawry/Vodafone-Cash orders after 48 hours.
3. Send "ad ends in 2 days" reminders.
4. Auto-send a listing to moderation when 3 distinct users report it.

All jobs are plain functions so tests can call them directly; `app.worker`
wraps them for ARQ (runs hourly in docker-compose).
"""

from __future__ import annotations

import logging
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

logger = logging.getLogger(__name__)

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
            if not notification_has(db, listing.owner_id, "ad_expired", "ad_period_id", str(period.id)):
                ends = as_utc(period.ends_at)
                create_notification(
                    db,
                    listing.owner_id,
                    "ad_expired",
                    "انتهى إعلانك ⏰",
                    f"انتهت فترة إعلان «{listing.title}» وتم إخفاؤه من البحث — جدد ليعود.",
                    {
                        "ad_period_id": str(period.id),
                        "listing_id": str(listing.id),
                        "ended_at": ends.isoformat() if ends else None,
                    },
                )
    from app.services.listing_service import refresh_ad_rank

    for period in stale:
        refresh_ad_rank(db, period.listing_id)
    db.flush()
    return len(stale)


def expire_pending_fawry_orders(db: Session, now=None) -> int:
    """Fawry + wallet (Vodafone Cash) references die after 48 h (spec)."""
    now = now or utcnow()
    orders = (
        db.execute(
            select(Order).where(
                Order.status == OrderStatus.pending.value,
                Order.method.in_([PaymentMethod.fawry.value, PaymentMethod.vodafone_cash.value]),
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


def purge_verification_documents(db: Session, now=None) -> int:
    """Privacy retention: delete verification docs 90 days after a final
    decision — unless the owner still has an open report (dispute window)."""
    from app.core.config import get_settings
    from app.models.identity import VerificationDocument

    now = now or utcnow()
    days = get_settings().verification_retention_days
    cutoff = now - timedelta(days=days)
    open_dispute_user_ids = select(Report.reporter_id).where(Report.status == ReportStatus.open.value)
    # clock starts at the FINAL DECISION (reviewed_at), not at upload time
    rows = (
        db.execute(
            select(VerificationDocument).where(
                VerificationDocument.status.in_(["approved", "rejected"]),
                VerificationDocument.reviewed_at.is_not(None),
                VerificationDocument.reviewed_at < cutoff,
            )
        )
        .scalars()
        .all()
    )
    count = 0
    storage = None
    for doc in rows:
        # dispute = any open report authored by this doc's owner OR on their listings
        has_dispute = (
            db.execute(
                select(Report.id)
                .join(Listing, Report.listing_id == Listing.id)
                .where(Listing.owner_id == doc.user_id, Report.status == ReportStatus.open.value)
                .limit(1)
            ).first()
            is not None
        )
        if has_dispute:
            continue
        if storage is None:
            from app.services.storage import build_storage

            storage = build_storage(get_settings())
        try:
            storage.delete(doc.file_key)
        except Exception:  # noqa: BLE001 — best effort, row still purged
            logger.warning("verification doc file missing key=%s", doc.file_key)
        db.delete(doc)
        count += 1
    db.flush()
    _ = (cutoff, open_dispute_user_ids)
    return count


def purge_contact_events(db: Session, now=None) -> int:
    """Privacy retention: contact events are kept for 12 months (spec)."""
    from app.core.config import get_settings
    from app.models.social import ContactEvent

    now = now or utcnow()
    months = get_settings().contact_event_retention_months
    cutoff = now - timedelta(days=30 * months)
    rows = db.execute(select(ContactEvent).where(ContactEvent.created_at < cutoff)).scalars().all()
    for row in rows:
        db.delete(row)
    db.flush()
    return len(rows)


def run_hourly_jobs(db: Session, now=None) -> dict[str, int]:
    import time as _time

    from app.core.metrics import JOB_FAILURES, JOB_RUNS

    jobs = {
        "ended_ad_periods": lambda: end_expired_ad_periods(db, now),
        "expired_orders": lambda: expire_pending_fawry_orders(db, now),
        "reminders_sent": lambda: send_ad_ending_reminders(db, now),
        "auto_moderated": lambda: auto_moderate_reported_listings(db),
        "purged_verification_docs": lambda: purge_verification_documents(db, now),
        "purged_contact_events": lambda: purge_contact_events(db, now),
    }
    result: dict[str, int] = {}
    for name, fn in jobs.items():
        try:
            result[name] = fn()
            JOB_RUNS.labels(name).set(_time.time())
        except Exception:  # noqa: BLE001 — one failing job must not kill the rest
            logger.exception("job %s failed", name)
            JOB_FAILURES.labels(name).inc()
            result[name] = -1
    return result


_ = User  # keep import surface explicit for future job extensions

"""Hourly jobs: ad expiry, Fawry 48h expiry, reminders, report auto-moderation."""

from __future__ import annotations

import uuid
from datetime import timedelta

from app.services.common import utcnow
from tests.conftest import (
    activate_listing_via_db,
    create_listing,
    otp_login,
    submit_and_approve,
    verify_owner,
)


def _active_with_ad(client, headers: dict, weeks: int = 1, **overrides) -> dict:
    verify_owner(client, headers)
    listing = create_listing(client, headers, **overrides)
    submit_and_approve(client, headers, listing["id"])
    activate_listing_via_db(client.app, listing["id"], weeks=weeks)
    return listing


def test_end_expired_ad_periods(client, app, seeded):
    headers = otp_login(client, "01066789991")["Authorization"]
    h = {"Authorization": headers}
    listing = _active_with_ad(client, h, title="إعلان للانتهاء")

    from app.models.catalog import Listing
    from app.models.commerce import AdPeriod
    from app.services.jobs import end_expired_ad_periods

    session = app.state.session_factory()
    try:
        period = session.query(AdPeriod).filter(AdPeriod.listing_id == uuid.UUID(listing["id"])).one()
        period.ends_at = utcnow() - timedelta(minutes=5)
        session.commit()
    finally:
        session.close()

    session = app.state.session_factory()
    try:
        n = end_expired_ad_periods(session)
        session.commit()
        assert n == 1
        assert session.get(Listing, uuid.UUID(listing["id"])).status == "expired"
        # ad period marked ended → job is idempotent
        assert end_expired_ad_periods(session) == 0
    finally:
        session.close()


def test_expire_fawry_orders_after_48h(client, app, seeded):
    headers = otp_login(client, "01066789992")["Authorization"]
    h = {"Authorization": headers}
    listing = _active_with_ad(client, h, title="فوري للانتهاء")
    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 1, "method": "fawry"},
        headers=h,
    )
    assert r.status_code == 201
    order_id = r.json()["id"]

    from app.models.commerce import Order
    from app.services.jobs import expire_pending_fawry_orders

    session = app.state.session_factory()
    try:
        order = session.get(Order, uuid.UUID(order_id))
        order.expires_at = utcnow() - timedelta(hours=1)
        session.commit()
    finally:
        session.close()

    session = app.state.session_factory()
    try:
        assert expire_pending_fawry_orders(session) == 1
        session.commit()
        assert session.get(Order, uuid.UUID(order_id)).status == "expired"
    finally:
        session.close()


def test_ad_ending_reminder_notification(client, app, seeded):
    headers = otp_login(client, "01066789993")["Authorization"]
    h = {"Authorization": headers}
    listing = _active_with_ad(client, h, title="تذكير قريب الانتهاء")

    from app.models.commerce import AdPeriod
    from app.services.jobs import send_ad_ending_reminders

    session = app.state.session_factory()
    try:
        period = session.query(AdPeriod).filter(AdPeriod.listing_id == uuid.UUID(listing["id"])).one()
        period.ends_at = utcnow() + timedelta(days=2, minutes=5)
        session.commit()
    finally:
        session.close()

    session = app.state.session_factory()
    try:
        assert send_ad_ending_reminders(session) == 1
        session.commit()
        # idempotent: no duplicate reminder for the same ad period
        assert send_ad_ending_reminders(session) == 0
        session.commit()
    finally:
        session.close()

    r = client.get("/api/v1/notifications", headers=h)
    assert r.status_code == 200
    items = r.json()["items"]
    assert items and items[0]["type"] == "ad_ending_soon"
    assert r.json()["unread_count"] == 1

    # mark all read
    r = client.post("/api/v1/notifications/read", json={"ids": []}, headers=h)
    assert r.json()["updated"] == 1
    r = client.get("/api/v1/notifications", headers=h)
    assert r.json()["unread_count"] == 0


def test_reports_threshold_job(client, app, seeded):
    """The hourly sweep also catches listings that hit 3 distinct reporters."""
    owner = otp_login(client, "01066789994")["Authorization"]
    h_owner = {"Authorization": owner}
    listing = _active_with_ad(client, h_owner, title="بلاغات متراكمة")

    for phone in ("01066789995", "01066789996", "01066789997"):
        th = {"Authorization": otp_login(client, phone)["Authorization"]}
        r = client.post(
            f"/api/v1/listings/{listing['id']}/report",
            json={"reason": "duplicate"},
            headers=th,
        )
        assert r.status_code == 200

    from app.services.jobs import auto_moderate_reported_listings

    session = app.state.session_factory()
    try:
        # inline trigger already moved it; job finds nothing new
        result = auto_moderate_reported_listings(session)
        session.commit()
        assert result == 0
        from app.models.catalog import Listing

        assert session.get(Listing, uuid.UUID(listing["id"])).status == "submitted"
    finally:
        session.close()


def test_run_hourly_jobs_bundle(client, app, seeded):
    from app.services.jobs import run_hourly_jobs

    session = app.state.session_factory()
    try:
        result = run_hourly_jobs(session)
        session.commit()
        assert set(result) == {
            "ended_ad_periods",
            "expired_orders",
            "reminders_sent",
            "auto_moderated",
            "purged_verification_docs",
            "purged_contact_events",
        }
        assert all(v >= 0 for v in result.values())  # no job failed
    finally:
        session.close()


def test_notifications_require_auth(client):
    r = client.get("/api/v1/notifications")
    assert r.status_code == 401

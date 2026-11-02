"""Phase 4C: privacy (export, retention, redaction), ops (ready/metrics/
security headers/funnel) — real endpoints, no mocks."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import timedelta

from tests.conftest import (  # type: ignore[import-not-found]
    admin_headers,
    create_listing,
    make_jpeg,
    otp_login,
    submit_and_approve,
    verify_owner,
)

OWNER = "01006660001"


def _headers(client, phone: str = OWNER) -> dict:
    return {"Authorization": f"Bearer {otp_login(client, phone)['tokens']['access_token']}"}


# ── privacy: data export ────────────────────────────────────────────────────


def test_me_export_contains_my_data_only(client, seeded):
    h = _headers(client)
    listing = create_listing(client, h)
    r = client.get("/api/v1/me/export", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["profile"]["phone"].endswith("0001") or "0001" in data["profile"]["phone"]
    assert any(row["id"] == listing["id"] for row in data["listings"])
    for key in ("favorites", "orders", "notifications", "contracts", "handovers", "contact_events"):
        assert key in data
    # someone else's data never leaks into my export
    other = _headers(client, "01006660002")
    create_listing(client, other)
    r2 = client.get("/api/v1/me/export", headers=h)
    ids = {row["id"] for row in r2.json()["listings"]}
    assert listing["id"] in ids and len(ids) == 1


# ── privacy: retention jobs ─────────────────────────────────────────────────


def test_verification_docs_purged_after_90_days_unless_dispute(client, app, seeded):
    from app.models.identity import VerificationDocument
    from app.services.common import utcnow
    from app.services.jobs import purge_verification_documents

    h = _headers(client)
    # upload a real doc then age it past the retention window
    r = client.post(
        "/api/v1/me/verification",
        headers=h,
        data={"doc_type": "electricity_bill"},
        files={"file": ("bill.jpg", make_jpeg(seed=11), "image/jpeg")},
    )
    assert r.status_code == 201
    session = app.state.session_factory()
    try:
        doc = session.query(VerificationDocument).order_by(VerificationDocument.created_at.desc()).first()
        doc.status = "approved"
        doc.reviewed_at = utcnow() - timedelta(days=91)
        session.commit()

        purged = purge_verification_documents(session, now=utcnow())
        session.commit()
        assert purged == 1
        assert session.query(VerificationDocument).filter(VerificationDocument.id == doc.id).first() is None
    finally:
        session.close()


def test_verification_docs_kept_while_dispute_open(client, app, seeded):
    from app.models.identity import User, VerificationDocument
    from app.models.social import Report
    from app.services.common import utcnow
    from app.services.jobs import purge_verification_documents

    h = _headers(client)
    listing = create_listing(client, h)
    r = client.post(
        "/api/v1/me/verification",
        headers=h,
        data={"doc_type": "electricity_bill"},
        files={"file": ("bill.jpg", make_jpeg(seed=12), "image/jpeg")},
    )
    assert r.status_code == 201
    session = app.state.session_factory()
    try:
        doc = session.query(VerificationDocument).order_by(VerificationDocument.created_at.desc()).first()
        doc.status = "rejected"
        doc.reviewed_at = utcnow() - timedelta(days=200)
        # someone filed an open report against this owner's listing (dispute)
        reporter = session.query(User).filter_by(phone="+201006660002").first()
        session.add(
            Report(
                listing_id=uuid.UUID(listing["id"]),
                reporter_id=reporter.id if reporter else doc.user_id,
                reason="wrong_info",
                status="open",
            )
        )
        session.commit()

        purged = purge_verification_documents(session, now=utcnow())
        session.commit()
        assert purged == 0  # dispute window keeps the evidence
        kept = (
            session.query(VerificationDocument)
            .filter(VerificationDocument.id == doc.id)
            .first()
        )
        assert kept is not None
    finally:
        session.close()


def test_contact_events_purged_after_12_months(client, app, seeded):
    from app.models.identity import User
    from app.models.social import ContactEvent
    from app.services.common import utcnow
    from app.services.jobs import purge_contact_events

    h = _headers(client)
    listing = create_listing(client, h)
    other = _headers(client, "01006660002") if False else None
    _ = other
    session = app.state.session_factory()
    try:
        reporter = session.query(User).filter_by(phone="+201006660001").one()
        session.add(
            ContactEvent(
                listing_id=uuid.UUID(listing["id"]),
                user_id=reporter.id,
                channel="call",
            )
        )
        session.commit()
        ev = session.query(ContactEvent).order_by(ContactEvent.created_at.desc()).first()
        ev.created_at = utcnow() - timedelta(days=400)
        session.commit()

        purged = purge_contact_events(session, now=utcnow())
        session.commit()
        assert purged >= 1
        assert session.query(ContactEvent).filter(ContactEvent.id == ev.id).first() is None
    finally:
        session.close()


# ── privacy: log redaction ──────────────────────────────────────────────────


def test_log_redaction_masks_pii_and_tokens():
    from app.core.logging import RedactionFilter

    record = logging.LogRecord(
        name="t", level=logging.INFO, pathname=__file__, lineno=1,
        msg="user 01001112234 nid 12345678901234 auth Bearer abcdef1234567890",
        args=(), exc_info=None,
    )
    RedactionFilter().filter(record)
    message = record.getMessage()
    assert "01001112234" not in message
    assert "12345678901234" not in message
    assert "abcdef1234567890" not in message
    assert "[PHONE]" in message and "[NID]" in message and "[TOKEN]" in message


# ── ops: readiness + metrics + headers ──────────────────────────────────────


def test_ready_metrics_and_security_headers(client):
    assert client.get("/ready").status_code == 200
    r = client.get("/metrics")
    assert r.status_code == 200
    assert "aqar_http_requests_total" in r.text

    health = client.get("/health")
    assert health.headers.get("x-content-type-options") == "nosniff"
    assert health.headers.get("x-frame-options") == "DENY"
    assert health.headers.get("referrer-policy") == "strict-origin-when-cross-origin"
    # CSP is prod-only (dev needs inline HMR scripts)
    assert "content-security-policy" not in health.headers


def test_security_headers_middleware_enforces_csp_in_prod():
    from app.core.config import Settings
    from app.core.security_headers import SecurityHeadersMiddleware

    async def fake_app(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})

    settings = Settings(_env_file=None, app_env="prod", secret_key="x" * 32, database_url="sqlite:///:memory:")
    mw = SecurityHeadersMiddleware(fake_app, settings)
    seen = {}

    async def send(message):
        seen.update(message)

    asyncio.run(mw({"type": "http", "path": "/"}, None, send))
    header_names = [k.decode() for k, _ in seen.get("headers", [])]
    assert "content-security-policy" in header_names
    assert "x-content-type-options" in header_names


def test_admin_funnel_endpoint(client, seeded):
    h = _headers(client)
    owner_headers = h
    listing = create_listing(client, owner_headers)
    verify_owner(client, owner_headers)
    submit_and_approve(client, owner_headers, listing["id"])

    ah = admin_headers(client)
    r = client.get("/api/v1/admin/analytics/funnel", headers=ah)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["users_registered"] >= 1
    assert body["listings_submitted_or_beyond"] >= 1
    assert body["listings_approved_or_beyond"] >= 1
    # moderator role cannot call it (only super admin) — we are super admin here
    assert "conversion_pct" in body


def test_cache_still_serves_locations_and_plans(client, seeded):
    r = client.get("/api/v1/locations", params={"level": "governorate"})
    assert r.status_code == 200 and len(r.json()) > 0
    # second hit (would come from cache in non-test envs)
    r2 = client.get("/api/v1/locations", params={"level": "governorate"})
    assert r2.json() == r.json()
    plans = client.get("/api/v1/plans")
    assert plans.status_code == 200
    assert len(plans.json()) >= 1

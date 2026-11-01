"""Contact reveal (BR-11), favorites, reports (3-report auto-moderation)."""

from __future__ import annotations

import uuid

from app.models.enums import ReportStatus
from tests.conftest import (
    activate_listing_via_db,
    create_listing,
    otp_login,
    submit_and_approve,
    verify_owner,
)


def _active_listing(client, headers: dict, **overrides) -> dict:
    verify_owner(client, headers)
    listing = create_listing(client, headers, **overrides)
    submit_and_approve(client, headers, listing["id"])
    activate_listing_via_db(client.app, listing["id"])
    return listing


def test_contact_requires_login_and_logs_event(client, app, seeded):
    owner = otp_login(client, "01033456661")["Authorization"]
    tenant = otp_login(client, "01033456662")["Authorization"]
    listing = _active_listing(client, {"Authorization": owner}, title="للإيجار المعادي")

    # visitor cannot see the phone
    r = client.get(f"/api/v1/listings/{listing['id']}/contact")
    assert r.status_code == 401
    assert r.json()["code"] == "AUTH_REQUIRED"

    # logged-in tenant sees it and the reveal is logged
    r = client.get(f"/api/v1/listings/{listing['id']}/contact", headers={"Authorization": tenant})
    assert r.status_code == 200
    body = r.json()
    assert body["phone"] == "+201033456661"

    session = app.state.session_factory()
    try:
        from app.models.social import ContactEvent

        events = session.query(ContactEvent).filter(ContactEvent.listing_id == uuid.UUID(listing["id"])).all()
        assert len(events) == 1
        assert events[0].channel == "show"
    finally:
        session.close()


def test_contact_hidden_for_non_active_listing(client, seeded):
    owner = otp_login(client, "01033456663")["Authorization"]
    tenant = otp_login(client, "01033456664")["Authorization"]
    listing = create_listing(client, {"Authorization": owner}, title="مسودة مخفية")
    r = client.get(f"/api/v1/listings/{listing['id']}/contact", headers={"Authorization": tenant})
    assert r.status_code == 404


def test_favorites_flow(client, seeded):
    owner = otp_login(client, "01033456665")["Authorization"]
    tenant = otp_login(client, "01033456666")["Authorization"]
    h_owner, h_tenant = {"Authorization": owner}, {"Authorization": tenant}
    listing = _active_listing(client, h_owner, title="مفضلة تجريبية")

    r = client.put(f"/api/v1/favorites/{listing['id']}", headers=h_tenant)
    assert r.status_code == 200
    assert r.json()["status"] == "added"
    # idempotent
    r = client.put(f"/api/v1/favorites/{listing['id']}", headers=h_tenant)
    assert r.status_code == 200

    r = client.get("/api/v1/favorites", headers=h_tenant)
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == listing["id"]
    assert "geo" in items[0]

    r = client.delete(f"/api/v1/favorites/{listing['id']}", headers=h_tenant)
    assert r.status_code == 200
    r = client.get("/api/v1/favorites", headers=h_tenant)
    assert r.json()["items"] == []


def test_favorites_require_auth(client):
    r = client.get("/api/v1/favorites")
    assert r.status_code == 401


def test_three_distinct_reports_trigger_moderation(client, app, seeded):
    owner = otp_login(client, "01033456667")["Authorization"]
    h_owner = {"Authorization": owner}
    listing = _active_listing(client, h_owner, title="إعلان مُبلَّغ عنه")

    phones = ["01033456668", "01033456669", "01033456670"]
    for phone in phones:
        tenant = otp_login(client, phone)["Authorization"]
        r = client.post(
            f"/api/v1/listings/{listing['id']}/report",
            json={"reason": "broker", "note": "يبدو أن الوسيط يعلن عنه"},
            headers={"Authorization": tenant},
        )
        assert r.status_code == 200, r.text

    # after 3 distinct reporters the listing is pushed back to moderation
    session = app.state.session_factory()
    try:
        from app.models.catalog import Listing

        assert session.get(Listing, uuid.UUID(listing["id"])).status == "submitted"
    finally:
        session.close()

    # and it disappeared from public search
    r = client.get("/api/v1/listings")
    assert all(i["id"] != listing["id"] for i in r.json()["items"])


def test_report_same_user_counts_once(client, app, seeded):
    owner = otp_login(client, "01033456671")["Authorization"]
    h_owner = {"Authorization": owner}
    listing = _active_listing(client, h_owner, title="مُبلَّغ عنه من مستخدم واحد")

    tenant = otp_login(client, "01033456672")["Authorization"]
    h = {"Authorization": tenant}
    for _ in range(3):
        r = client.post(
            f"/api/v1/listings/{listing['id']}/report",
            json={"reason": "wrong_info"},
            headers=h,
        )
        assert r.status_code == 200

    session = app.state.session_factory()
    try:
        from app.models.catalog import Listing
        from app.models.social import Report

        assert session.get(Listing, uuid.UUID(listing["id"])).status == "active"
        reports = session.query(Report).filter(Report.listing_id == uuid.UUID(listing["id"])).all()
        assert len(reports) == 3
        assert all(r.status == ReportStatus.open.value for r in reports)
    finally:
        session.close()


def test_owner_cannot_report_own_listing(client, seeded):
    owner = otp_login(client, "01033456673")["Authorization"]
    h = {"Authorization": owner}
    listing = _active_listing(client, h, title="إعلاني الخاص")
    r = client.post(f"/api/v1/listings/{listing['id']}/report", json={"reason": "fraud"}, headers=h)
    assert r.status_code == 400
    assert r.json()["code"] == "CANNOT_REPORT_OWN"

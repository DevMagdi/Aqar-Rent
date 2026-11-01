"""Seed idempotency + demo data, storage abstraction, admin report actions."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.services.seed_service import GOVERNORATES, run_seed
from tests.conftest import admin_headers, otp_login


def test_seed_is_idempotent(app):
    s = app.state.settings
    for _ in range(2):
        session = app.state.session_factory()
        try:
            stats = run_seed(session, s, demo=False)
        finally:
            session.close()
    assert stats["governorates"] == len(GOVERNORATES) == 27

    session = app.state.session_factory()
    try:
        from app.models.catalog import Location, Plan
        from app.models.identity import StaffUser

        assert session.query(Location).filter(Location.level == "governorate").count() == 27
        assert session.query(Plan).count() == 1
        assert session.query(StaffUser).count() == 1
    finally:
        session.close()


def test_seed_demo_creates_visible_listings(app, client):
    s = app.state.settings
    session = app.state.session_factory()
    try:
        run_seed(session, s, demo=True)
    finally:
        session.close()

    # demo ads are Active with running ad periods → visible in public search
    r = client.get("/api/v1/listings")
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 3
    assert all(i["thumb_url"] for i in items)

    # demo owner can log in with OTP and sees their listings
    headers = otp_login(client, "01000000001")["Authorization"]
    r = client.get("/api/v1/me/listings", headers={"Authorization": headers})
    assert r.status_code == 200
    assert len(r.json()) == 3
    assert all(x["stats"]["days_left"] is not None for x in r.json())


# ── storage ──────────────────────────────────────────────────────────────────


def test_local_storage_roundtrip(tmp_path):
    from app.services.storage import LocalStorage

    st = LocalStorage(str(tmp_path / "store"), secret_key="k" * 32)
    st.put("listings/x/1.jpg", b"bytes", "image/jpeg")
    assert st.exists("listings/x/1.jpg")
    assert st.read("listings/x/1.jpg") == b"bytes"
    assert st.public_url("listings/x/1.jpg").startswith("/api/v1/files/public/")

    url = st.signed_url("users/u/doc.pdf", expires_in=60)
    assert "token=" in url
    from urllib.parse import parse_qs, urlparse

    q = parse_qs(urlparse(url).query)
    assert st.verify(q["key"][0], int(q["expires"][0]), q["token"][0])
    assert not st.verify(q["key"][0], int(q["expires"][0]) - 9999, q["token"][0])
    assert not st.verify("other/key", int(q["expires"][0]), q["token"][0])

    st.delete("listings/x/1.jpg")
    assert not st.exists("listings/x/1.jpg")

    # path traversal is rejected
    from app.core.errors import AppError

    with pytest.raises(AppError):
        st.put("../../evil.txt", b"x", "text/plain")


def test_s3_storage_with_mocked_boto3():
    from app.core.config import Settings
    from app.services.storage import S3Storage

    fake = MagicMock()
    fake.generate_presigned_url.return_value = "http://signed"
    with patch("boto3.client", return_value=fake):
        st = S3Storage(
            Settings(
                _env_file=None,
                storage_backend="s3",
                s3_endpoint_url="http://minio:9000",
                s3_access_key="a",
                s3_secret_key="b",
            )
        )
    st.put("listings/1/a.jpg", b"jpg", "image/jpeg")
    fake.put_object.assert_called_once()
    st.put("users/u/proof.jpg", b"pdf", "application/pdf")
    assert fake.put_object.call_args.kwargs["Bucket"] == "aqar-documents"
    assert st.signed_url("users/u/proof.jpg") == "http://signed"
    assert st.public_url("listings/1/a.jpg").endswith("/aqar-media/listings/1/a.jpg")


def test_public_file_endpoint_serves_local_media(client, seeded):
    headers = otp_login(client, "01077889991")["Authorization"]
    from tests.conftest import create_listing, upload_photos

    h = {"Authorization": headers}
    listing = create_listing(client, h)
    upload_photos(client, h, listing["id"], count=1)
    r = client.get(f"/api/v1/listings/{listing['id']}", headers=h)
    url = r.json()["media"][0]["url"]
    r = client.get(url)
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/jpeg"

    r = client.get("/api/v1/files/public/listings/does-not-exist.jpg")
    assert r.status_code == 404


# ── admin reports & promos ───────────────────────────────────────────────────


def test_admin_reports_queue_and_actions(client, app, seeded):
    owner = otp_login(client, "01077889992")["Authorization"]
    h_owner = {"Authorization": owner}
    from tests.conftest import activate_listing_via_db, create_listing, submit_and_approve, verify_owner

    verify_owner(client, h_owner)
    listing = create_listing(client, h_owner, title="بلاغ عليه إجراء")
    submit_and_approve(client, h_owner, listing["id"])
    activate_listing_via_db(client.app, listing["id"])

    tenant = {"Authorization": otp_login(client, "01077889993")["Authorization"]}
    r = client.post(
        f"/api/v1/listings/{listing['id']}/report",
        json={"reason": "scam", "note": "يبدو محتال"},
        headers=tenant,
    )
    assert r.status_code == 200
    report_id = r.json()["id"]

    admin = admin_headers(client)
    r = client.get("/api/v1/admin/reports?status=open", headers=admin)
    assert r.status_code == 200
    assert report_id in [x["id"] for x in r.json()]

    # action: remove listing
    r = client.post(
        f"/api/v1/admin/reports/{report_id}/action",
        json={"action": "remove_listing", "note": "مخالفة قواعد المحتوى"},
        headers=admin,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "resolved"

    # listing no longer public
    r = client.get(f"/api/v1/listings/{listing['id']}")
    assert r.status_code == 404

    # unknown action rejected
    r = client.post(
        f"/api/v1/admin/reports/{report_id}/action",
        json={"action": "do_something"},
        headers=admin,
    )
    assert r.status_code == 422

    # audit trail captured listing removal
    r = client.get("/api/v1/admin/audit-logs?entity=listing", headers=admin)
    assert any(a["action"] == "listing.remove" for a in r.json())


def test_admin_promo_list_and_patch(client, seeded):
    admin = admin_headers(client)
    r = client.post(
        "/api/v1/admin/promo-codes",
        json={"code": "WELCOME", "type": "percent", "value": 25, "max_uses": 10},
        headers=admin,
    )
    assert r.status_code == 201, r.text
    promo_id = r.json()["id"]

    # duplicate rejected
    r = client.post(
        "/api/v1/admin/promo-codes",
        json={"code": "WELCOME", "type": "percent", "value": 10},
        headers=admin,
    )
    assert r.status_code == 409

    r = client.get("/api/v1/admin/promo-codes", headers=admin)
    assert promo_id in [p["id"] for p in r.json()]

    r = client.patch(
        f"/api/v1/admin/promo-codes/{promo_id}",
        json={"active": False},
        headers=admin,
    )
    assert r.status_code == 200 and r.json()["active"] is False

    r = client.delete(f"/api/v1/admin/promo-codes/{promo_id}", headers=admin)
    assert r.status_code == 200

    # inactive promo is invalid for checkout
    headers = otp_login(client, "01077889994")["Authorization"]
    r = client.post(
        "/api/v1/promo/validate",
        json={"code": "WELCOME", "weeks": 1},
        headers={"Authorization": headers},
    )
    assert r.json()["valid"] is False


def test_contact_rate_limit(client, app, seeded):
    from app.core.errors import AppError
    from app.core.rate_limit import check_rate_limit

    with pytest.raises(AppError) as exc:
        check_rate_limit("rl-test", max_hits=2, window_seconds=60)
        check_rate_limit("rl-test", max_hits=2, window_seconds=60)
        check_rate_limit("rl-test", max_hits=2, window_seconds=60)
    assert exc.value.status_code == 429

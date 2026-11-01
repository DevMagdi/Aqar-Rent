"""Me endpoints (profile, devices, verification, listings stats) + locations."""

from __future__ import annotations

from tests.conftest import (
    GOV_CAIRO,
    create_listing,
    make_jpeg,
    make_pdf,
    otp_login,
)


def test_locations_governorates_then_children(client, seeded):
    r = client.get("/api/v1/locations")
    assert r.status_code == 200
    gov = r.json()
    assert len(gov) == 27
    assert {g["level"] for g in gov} == {"governorate"}

    r = client.get(f"/api/v1/locations?parent_id={GOV_CAIRO}")
    assert r.status_code == 200
    cities = r.json()
    names = {c["name_en"] for c in cities}
    assert "Cairo" in names and "New Cairo" in names

    cairo_city = next(c for c in cities if c["name_en"] == "Cairo")
    r = client.get(f"/api/v1/locations?parent_id={cairo_city['id']}")
    districts = r.json()
    assert "Maadi" in {d["name_en"] for d in districts}


def test_me_patch_and_get(client):
    headers = otp_login(client, "01012341111")["Authorization"]
    h = {"Authorization": headers}
    r = client.patch("/api/v1/me", json={"full_name": "محمد أحمد", "language": "ar"}, headers=h)
    assert r.status_code == 200
    assert r.json()["full_name"] == "محمد أحمد"
    r = client.get("/api/v1/me", headers=h)
    assert r.json()["phone"] == "+201012341111"


def test_me_delete_anonymizes_but_keeps_orders(client, app, seeded):
    headers = otp_login(client, "01012341112")["Authorization"]
    h = {"Authorization": headers}
    listing = create_listing(client, h)
    # minimal path: owner must verify to submit; do a submission to create an order later
    from tests.conftest import submit_and_approve, verify_owner

    verify_owner(client, h)
    submit_and_approve(client, h, listing["id"])
    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 1, "method": "bank_transfer"},
        headers=h,
    )
    assert r.status_code == 201, r.text
    order_id = r.json()["id"]

    r = client.delete("/api/v1/me", headers=h)
    assert r.status_code == 200

    # token still decodes but account is gone → 401
    r = client.get("/api/v1/me", headers=h)
    assert r.status_code == 401

    session = app.state.session_factory()
    try:
        import uuid as _uuid

        from app.models.commerce import Order
        from app.models.identity import User

        user = session.query(User).filter(User.phone.like("deleted_%")).one()
        assert user.full_name is None and user.email is None
        order = session.get(Order, _uuid.UUID(order_id))
        assert order is not None  # financial records kept
        assert str(order.owner_id) == str(user.id)
    finally:
        session.close()


def test_devices_registration(client):
    headers = otp_login(client, "01012341113")["Authorization"]
    r = client.post(
        "/api/v1/me/devices",
        json={"platform": "android", "push_token": "tok123"},
        headers={"Authorization": headers},
    )
    assert r.status_code == 201
    assert r.json()["platform"] == "android"


def test_verification_upload_private_signed_url(client):
    headers = otp_login(client, "01012341114")["Authorization"]
    h = {"Authorization": headers}
    r = client.post(
        "/api/v1/me/verification",
        headers=h,
        data={"doc_type": "ownership_contract"},
        files={"file": ("contract.pdf", make_pdf(), "application/pdf")},
    )
    assert r.status_code == 201, r.text
    url = r.json()["file_url"]
    assert "token=" in url and "expires=" in url
    # signed URL works
    r = client.get(url)
    assert r.status_code == 200
    # wrong signature rejected
    bad = url.rsplit("token=", 1)[0] + "token=deadbeef"
    r = client.get(bad)
    assert r.status_code == 403

    r = client.get("/api/v1/me/verification", headers=h)
    assert r.status_code == 200
    assert r.json()["items"][0]["status"] == "pending"
    assert r.json()["user_verification_status"] == "pending"


def test_verification_rejects_bad_type(client):
    headers = otp_login(client, "01012341115")["Authorization"]
    r = client.post(
        "/api/v1/me/verification",
        headers={"Authorization": headers},
        data={"doc_type": "bank_statement"},
        files={"file": ("x.jpg", make_jpeg(), "image/jpeg")},
    )
    assert r.status_code == 422


def test_me_listings_with_stats(client, seeded):
    headers = otp_login(client, "01012341116")["Authorization"]
    h = {"Authorization": headers}
    listing = create_listing(client, h)
    r = client.get("/api/v1/me/listings", headers=h)
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert items[0]["id"] == listing["id"]
    assert items[0]["stats"]["view_count"] == 0
    assert items[0]["governorate_name"] == "القاهرة"

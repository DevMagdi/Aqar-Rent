"""Orders & promos: BR-1 (price from table), BR-2 (1..4 weeks), BR-5 (approve first), BR-9."""

from __future__ import annotations

from tests.conftest import (
    admin_headers,
    create_listing,
    otp_login,
    submit_and_approve,
    verify_owner,
)


def _approved_listing(client, headers: dict) -> dict:
    verify_owner(client, headers)
    listing = create_listing(client, headers)
    submit_and_approve(client, headers, listing["id"])
    return listing


def test_order_requires_moderator_approval_br5(client, seeded):
    headers = otp_login(client, "01044567771")["Authorization"]
    h = {"Authorization": headers}
    listing = create_listing(client, h)  # draft

    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 1, "method": "card"},
        headers=h,
    )
    assert r.status_code == 409
    assert r.json()["code"] == "ORDER_NOT_APPROVED"
    assert r.json()["details"]["listing_status"] == "draft"

    # submitted — still blocked
    verify_owner(client, h)
    from tests.conftest import upload_photos

    upload_photos(client, h, listing["id"])
    client.post(f"/api/v1/listings/{listing['id']}/submit", headers=h)
    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 1, "method": "card"},
        headers=h,
    )
    assert r.status_code == 409

    # rejected — never charged (BR-5)
    admin = admin_headers(client)
    client.post(
        f"/api/v1/admin/listings/{listing['id']}/reject",
        json={"reason_code": "wrong_location"},
        headers=admin,
    )
    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 1, "method": "card"},
        headers=h,
    )
    assert r.status_code == 409

    # approved → order allowed
    listing2 = _approved_listing(client, h)
    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing2["id"], "weeks": 1, "method": "card"},
        headers=h,
    )
    assert r.status_code == 201, r.text
    assert float(r.json()["subtotal"]) == 500.0  # BR-1 default plan
    assert float(r.json()["total"]) == 500.0


def test_order_total_uses_plan_table_not_hardcoded_br1(client, app, seeded):
    headers = otp_login(client, "01044567772")["Authorization"]
    h = {"Authorization": headers}
    listing = _approved_listing(client, h)

    # change the price IN THE TABLE → order total follows (never hard-coded)
    from app.models.catalog import Plan

    session = app.state.session_factory()
    try:
        plan = session.query(Plan).filter(Plan.active.is_(True)).first()
        plan.price_egp = 750
        session.commit()
    finally:
        session.close()

    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 2, "method": "fawry"},
        headers=h,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert float(body["subtotal"]) == 1500.0  # 2 × 750
    assert body["expires_at"] is not None  # Fawry pending orders expire (48h)


def test_weeks_limits_br2(client, seeded):
    headers = otp_login(client, "01044567773")["Authorization"]
    h = {"Authorization": headers}
    listing = _approved_listing(client, h)

    for weeks in (0, 5, -1):
        r = client.post(
            "/api/v1/orders",
            json={"listing_id": listing["id"], "weeks": weeks, "method": "card"},
            headers=h,
        )
        assert r.status_code == 422, f"weeks={weeks} → {r.status_code}"

    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 4, "method": "card"},
        headers=h,
    )
    assert r.status_code == 201
    assert float(r.json()["subtotal"]) == 2000.0  # 4 × 500, no discount (R1)


def test_order_of_others_listing_forbidden(client, seeded):
    owner = otp_login(client, "01044567774")["Authorization"]
    other = otp_login(client, "01044567775")["Authorization"]
    listing = _approved_listing(client, {"Authorization": owner})
    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 1, "method": "card"},
        headers={"Authorization": other},
    )
    assert r.status_code == 404


def test_bank_transfer_order_has_instructions(client, seeded):
    headers = otp_login(client, "01044567776")["Authorization"]
    h = {"Authorization": headers}
    listing = _approved_listing(client, h)
    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 1, "method": "bank_transfer"},
        headers=h,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["bank_instructions"]["reference"].startswith("AQR-")
    assert body["status"] == "pending"


def test_promo_validation_br9(client, app, seeded):
    headers = otp_login(client, "01044567777")["Authorization"]
    h = {"Authorization": headers}

    # create promo via admin
    admin = admin_headers(client)
    r = client.post(
        "/api/v1/admin/promo-codes",
        json={"code": "HALF50", "type": "percent", "value": 50, "max_uses": 2},
        headers=admin,
    )
    assert r.status_code == 201, r.text

    r = client.post("/api/v1/promo/validate", json={"code": "half50", "weeks": 2}, headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is True
    assert body["subtotal"] == 1000.0
    assert body["discount"] == 500.0
    assert body["total"] == 500.0

    # unknown code
    r = client.post("/api/v1/promo/validate", json={"code": "NOPE", "weeks": 1}, headers=h)
    assert r.json()["valid"] is False

    # exhaust max_uses=2
    listing = _approved_listing(client, h)
    for _ in range(2):
        r = client.post(
            "/api/v1/orders",
            json={"listing_id": listing["id"], "weeks": 1, "promo_code": "HALF50", "method": "card"},
            headers=h,
        )
        assert r.status_code == 201, r.text
    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 1, "promo_code": "HALF50", "method": "card"},
        headers=h,
    )
    assert r.status_code == 400
    assert r.json()["code"] == "PROMO_EXHAUSTED"


def test_free_weeks_promo(client, seeded):
    headers = otp_login(client, "01044567778")["Authorization"]
    h = {"Authorization": headers}
    admin = admin_headers(client)
    r = client.post(
        "/api/v1/admin/promo-codes",
        json={"code": "FIRSTAD", "type": "free_weeks", "value": 1, "max_uses": 100},
        headers=admin,
    )
    assert r.status_code == 201
    r = client.post("/api/v1/promo/validate", json={"code": "FIRSTAD", "weeks": 3}, headers=h)
    body = r.json()
    assert body["valid"] and body["discount"] == 500.0 and body["total"] == 1000.0


def test_my_orders_list(client, seeded):
    headers = otp_login(client, "01044567779")["Authorization"]
    h = {"Authorization": headers}
    listing = _approved_listing(client, h)
    client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 1, "method": "card"},
        headers=h,
    )
    r = client.get("/api/v1/me/orders", headers=h)
    assert r.status_code == 200
    assert len(r.json()["items"]) == 1


def test_plans_public(client, seeded):
    r = client.get("/api/v1/plans")
    assert r.status_code == 200
    plans = r.json()
    assert len(plans) == 1
    assert float(plans[0]["price_egp"]) == 500.0
    assert plans[0]["duration_days"] == 7

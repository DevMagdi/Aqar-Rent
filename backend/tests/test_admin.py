"""Admin panel: 2FA login, role checks, moderation/verification/users/plans/audit."""

from __future__ import annotations

import uuid

import pyotp

from tests.conftest import (
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    ADMIN_TOTP,
    admin_headers,
    create_listing,
    otp_login,
    submit_and_approve,
    upload_photos,
    verify_owner,
)


def _login_admin(client, email=ADMIN_EMAIL, password=ADMIN_PASSWORD, totp=None):
    return client.post(
        "/api/v1/admin/auth/login",
        json={
            "email": email,
            "password": password,
            "totp_code": totp or pyotp.TOTP(ADMIN_TOTP).now(),
        },
    )


def _make_staff(app, email: str, password: str, role: str, totp: str) -> None:
    from app.core.security import hash_password
    from app.models.identity import StaffUser

    session = app.state.session_factory()
    try:
        staff = StaffUser(
            email=email,
            password_hash=hash_password(password, 4),
            role=role,
            two_factor_secret=totp,
            status="active",
        )
        session.add(staff)
        session.commit()
    finally:
        session.close()


def test_login_requires_correct_password_and_totp(client, seeded):
    r = _login_admin(client, password="WrongPassword99!")
    assert r.status_code == 401
    assert r.json()["code"] == "INVALID_CREDENTIALS"

    r = _login_admin(client, totp="000000")
    assert r.status_code == 401

    r = _login_admin(client)
    assert r.status_code == 200
    assert r.json()["role"] == "super_admin"


def test_admin_requires_staff_token(client):
    r = client.get("/api/v1/admin/dashboard")
    assert r.status_code == 401
    user_headers = otp_login(client, "01055678881")["Authorization"]
    r = client.get("/api/v1/admin/dashboard", headers={"Authorization": user_headers})
    assert r.status_code == 401


def test_roles_enforced(client, app, seeded):
    _make_staff(app, "mod@aqar-rent.dev", "ModPass123!", "moderator", pyotp.random_base32())
    _make_staff(app, "fin@aqar-rent.dev", "FinPass123!", "finance", pyotp.random_base32())

    from app.models.identity import StaffUser

    session = client.app.state.session_factory()
    try:
        mod_secret = (
            session.query(StaffUser).filter(StaffUser.email == "mod@aqar-rent.dev").one().two_factor_secret
        )
        fin_secret = (
            session.query(StaffUser).filter(StaffUser.email == "fin@aqar-rent.dev").one().two_factor_secret
        )
    finally:
        session.close()

    mod_headers = {
        "Authorization": "Bearer "
        + _login_admin(
            client, email="mod@aqar-rent.dev", password="ModPass123!", totp=pyotp.TOTP(mod_secret).now()
        ).json()["access_token"]
    }
    fin_headers = {
        "Authorization": "Bearer "
        + _login_admin(
            client, email="fin@aqar-rent.dev", password="FinPass123!", totp=pyotp.TOTP(fin_secret).now()
        ).json()["access_token"]
    }

    # moderator: can view moderation queue, CANNOT touch payments/plans/users-ban
    r = client.get("/api/v1/admin/listings", headers=mod_headers)
    assert r.status_code == 200
    r = client.get("/api/v1/admin/payments", headers=mod_headers)
    assert r.status_code == 403
    assert r.json()["code"] == "INSUFFICIENT_ROLE"
    r = client.get("/api/v1/admin/audit-logs", headers=mod_headers)
    assert r.status_code == 403

    # finance: payments yes, moderation no
    r = client.get("/api/v1/admin/payments/revenue", headers=fin_headers)
    assert r.status_code == 200
    r = client.get("/api/v1/admin/listings", headers=fin_headers)
    assert r.status_code == 403

    # super admin can do everything
    admin = admin_headers(client)
    assert client.get("/api/v1/admin/audit-logs", headers=admin).status_code == 200


def test_moderation_queue_and_actions_with_audit(client, app, seeded):
    headers = otp_login(client, "01055678882")["Authorization"]
    h = {"Authorization": headers}
    verify_owner(client, h)
    listing = create_listing(client, h, title="للمراجعة الآن")
    upload_photos(client, h, listing["id"])
    client.post(f"/api/v1/listings/{listing['id']}/submit", headers=h)

    admin = admin_headers(client)
    r = client.get("/api/v1/admin/listings?status=submitted", headers=admin)
    assert r.status_code == 200
    queue = [q for q in r.json() if q["listing_id"] == listing["id"]]
    assert queue and queue[0]["owner_phone"] == "+201055678882"
    assert queue[0]["verification_status"] == "approved"

    # admin detail
    r = client.get(f"/api/v1/admin/listings/{listing['id']}", headers=admin)
    assert r.status_code == 200
    assert r.json()["owner_phone"] == "+201055678882"
    assert r.json()["media_urls"]

    # approve → audit log written
    r = client.post(f"/api/v1/admin/listings/{listing['id']}/approve", headers=admin)
    assert r.status_code == 200 and r.json()["status"] == "approved"

    r = client.get("/api/v1/admin/audit-logs", headers=admin)
    assert r.status_code == 200
    actions = [a["action"] for a in r.json()]
    assert "listing.approve" in actions
    assert "verification.approve" in actions  # from verify_owner


def test_verification_queue_decision(client, app, seeded):
    from tests.conftest import make_jpeg

    headers = otp_login(client, "01055678883")["Authorization"]
    h = {"Authorization": headers}
    r = client.post(
        "/api/v1/me/verification",
        headers=h,
        data={"doc_type": "water_bill"},
        files={"file": ("water.jpg", make_jpeg(seed=3), "image/jpeg")},
    )
    assert r.status_code == 201, r.text
    doc_id = r.json()["id"]

    admin = admin_headers(client)
    r = client.get("/api/v1/admin/verifications?status=pending", headers=admin)
    assert r.status_code == 200
    assert doc_id in [v["id"] for v in r.json()]

    # reject requires reason
    r = client.post(
        f"/api/v1/admin/verifications/{doc_id}/decision",
        json={"decision": "reject"},
        headers=admin,
    )
    assert r.status_code == 422

    r = client.post(
        f"/api/v1/admin/verifications/{doc_id}/decision",
        json={"decision": "reject", "reason": "صورة غير واضحة"},
        headers=admin,
    )
    assert r.status_code == 200

    # user badge reflects rejection (no approved docs)
    me = client.get("/api/v1/me", headers=h).json()
    assert me["verification_status"] == "rejected"


def test_users_ban_and_audit(client, app, seeded):
    headers = otp_login(client, "01055678884")["Authorization"]
    h = {"Authorization": headers}
    me = client.get("/api/v1/me", headers=h).json()
    admin = admin_headers(client)

    r = client.patch(f"/api/v1/admin/users/{me['id']}", json={"status": "banned"}, headers=admin)
    assert r.status_code == 200
    assert r.json()["status"] == "banned"

    # banned user's token is rejected on the next request
    r = client.get("/api/v1/me", headers=h)
    assert r.status_code == 403
    assert r.json()["code"] == "ACCOUNT_BANNED"

    # audit entry
    r = client.get("/api/v1/admin/audit-logs?entity=user", headers=admin)
    assert any(a["action"].startswith("user.update") for a in r.json())


def test_dashboard_kpis(client, seeded):
    headers = otp_login(client, "01055678885")["Authorization"]
    h = {"Authorization": headers}
    create_listing(client, h)
    admin = admin_headers(client)
    r = client.get("/api/v1/admin/dashboard", headers=admin)
    assert r.status_code == 200
    body = r.json()
    assert body["users_total"] >= 1
    assert body["listings_by_status"]["draft"] >= 1
    assert body["revenue_egp"] == 0.0


def test_plans_crud(client, app, seeded):
    admin = admin_headers(client)
    r = client.get("/api/v1/admin/plans", headers=admin)
    assert r.status_code == 200
    plan_id = r.json()[0]["id"]

    r = client.patch(
        f"/api/v1/admin/plans/{plan_id}",
        json={"price_egp": 650},
        headers=admin,
    )
    assert r.status_code == 200
    assert float(r.json()["price_egp"]) == 650.0

    # public endpoint reflects the table change (BR-1)
    assert float(client.get("/api/v1/plans").json()[0]["price_egp"]) == 650.0

    # create + deactivate a tier
    r = client.post(
        "/api/v1/admin/plans",
        json={"name": "Premium", "price_egp": 1200, "priority_weight": 10},
        headers=admin,
    )
    assert r.status_code == 201
    new_id = r.json()["id"]
    r = client.delete(f"/api/v1/admin/plans/{new_id}", headers=admin)
    assert r.status_code == 200
    active = client.get("/api/v1/plans").json()
    assert all(p["id"] != new_id for p in active)


def test_payments_refund_and_csv(client, app, seeded):
    """Paid payment → refund (finance) + CSV export + revenue math."""
    from app.models.commerce import Order, Payment
    from app.models.enums import OrderStatus, PaymentMethod, PaymentStatus

    headers = otp_login(client, "01055678886")["Authorization"]
    h = {"Authorization": headers}
    verify_owner(client, h)
    listing = create_listing(client, h)
    submit_and_approve(client, h, listing["id"])
    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 1, "method": "card"},
        headers=h,
    )
    assert r.status_code == 201
    order_id = r.json()["id"]

    # simulate a captured gateway payment (Phase 2 wires the real gateway)
    session = app.state.session_factory()
    try:
        order = session.get(Order, uuid.UUID(order_id))
        order.status = OrderStatus.paid.value
        from app.services.common import utcnow

        order.paid_at = utcnow()
        payment = Payment(
            order_id=order.id,
            method=PaymentMethod.card.value,
            amount=order.total,
            status=PaymentStatus.paid.value,
            gateway_txn_id="TXN-TEST-1",
        )
        session.add(payment)
        session.commit()
        payment_id = str(payment.id)
    finally:
        session.close()

    admin = admin_headers(client)
    r = client.get("/api/v1/admin/payments?status=paid", headers=admin)
    assert r.status_code == 200
    assert r.json()[0]["owner_phone"] == "+201055678886"

    r = client.get("/api/v1/admin/payments/revenue", headers=admin)
    assert float(r.json()["total_paid_egp"]) == 500.0
    assert float(r.json()["net_egp"]) == 500.0

    # partial refund200 → still 'paid' until fully refunded
    r = client.post(
        f"/api/v1/admin/payments/{payment_id}/refund",
        json={"amount": 200, "reason": "goodwill"},
        headers=admin,
    )
    assert r.status_code == 200, r.text

    # over-refund rejected
    r = client.post(
        f"/api/v1/admin/payments/{payment_id}/refund",
        json={"amount": 400, "reason": "too much"},
        headers=admin,
    )
    assert r.status_code == 422

    # full remaining refund → payment + order refunded (BR-8)
    r = client.post(
        f"/api/v1/admin/payments/{payment_id}/refund",
        json={"reason": "platform fault"},
        headers=admin,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "refunded"

    r = client.get("/api/v1/admin/payments/revenue", headers=admin)
    assert float(r.json()["total_refunded_egp"]) == 500.0
    assert float(r.json()["net_egp"]) == 0.0

    r = client.get("/api/v1/admin/payments/export", headers=admin)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "payment_id" in r.text

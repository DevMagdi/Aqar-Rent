"""Phase 5 acceptance tests: pricing, subscriptions, offices/CRM, trust ladder,
appeals, payment audit, registry honesty, production config strictness.

Run: pytest tests/test_phase5_growth.py -q
"""

from __future__ import annotations

from decimal import Decimal

from tests.conftest import (
    admin_headers,
    create_listing,
    make_jpeg,
    otp_login,
    submit_and_approve,
    upload_photos,
    verify_owner,
)


def _h(client, phone: str) -> dict:
    return {"Authorization": otp_login(client, phone)["Authorization"]}


def _approved_listing(client, h: dict) -> dict:
    verify_owner(client, h)
    listing = create_listing(client, h)
    upload_photos(client, h, listing["id"])
    submit_and_approve(client, h, listing["id"])
    return listing


def _webhook(client, event: str, txn: str, ref: str, cents: int, *, sig: str | None = None):
    from app.services.payments.mock import MockProvider

    provider = MockProvider(client.app.state.settings)
    body, good = provider.build_webhook(
        event=event, txn_id=txn, order_ref=ref, amount_cents=cents
    )
    return client.post(f"/api/v1/payments/webhook?sig={sig or good}", content=body)


# ── pricing / packages (acceptance: DB prices, multi-week, discounts) ────────


def test_pricing_catalog_is_db_driven_and_honest(client, seeded):
    r = client.get("/api/v1/pricing")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["currency"] == "EGP"
    assert body["weekly_ad"]["price_egp"] == 500
    assert {p["weeks"] for p in body["packages"]} >= {2, 4, 8}
    assert any(p["discount_pct"] > 0 for p in body["packages"])
    audiences = {s["audience"] for s in body["subscriptions"]}
    assert audiences == {"individual", "office"}
    assert body["principles"]["no_rent_money"] is True
    assert body["principles"]["broker_optional"] is True


def test_multiweek_package_order_validates_and_settles(client, seeded):
    h = _h(client, "01051110001")
    listing = _approved_listing(client, h)
    packages = client.get("/api/v1/pricing").json()["packages"]
    package = next(p for p in packages if p["weeks"] == 8)
    # Legacy BR-2 stays intact: >4 weeks without a package is rejected.
    bad = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 8, "method": "card"},
        headers=h,
    )
    assert bad.status_code == 422
    r = client.post(
        "/api/v1/orders",
        json={
            "listing_id": listing["id"],
            "weeks": 8,
            "package_id": package["id"],
            "method": "card",
        },
        headers=h,
    )
    assert r.status_code == 201, r.text
    order = r.json()
    assert order["weeks"] == 8 and order["package_id"] == package["id"]
    assert order["total"] < order["subtotal"]  # package discount applied
    res = _webhook(
        client,
        "success",
        "TXN-PKG-1",
        order["gateway_ref"],
        int(Decimal(str(order["total"])) * 100),
    )
    assert res.json()["status"] == "ok", res.text
    detail = client.get(f"/api/v1/listings/{listing['id']}", headers=h).json()
    assert detail["status"] == "active"
    assert detail["is_featured"] is True  # priority boost from the package


def test_admin_can_manage_packages_and_subscription_plans(client, seeded):
    admin = admin_headers(client)
    r = client.post(
        "/api/v1/admin/growth/ad-packages",
        json={
            "code": "ramadan12",
            "name_ar": "باقة رمضان",
            "name_en": "Ramadan 12 weeks",
            "weeks": 12,
            "discount_pct": 20,
            "priority_weight": 5,
            "is_featured": True,
        },
        headers=admin,
    )
    assert r.status_code == 201, r.text
    assert r.json()["total"] < r.json()["subtotal"]
    package_id = r.json()["id"]
    r = client.patch(
        f"/api/v1/admin/growth/ad-packages/{package_id}",
        json={"discount_pct": 25},
        headers=admin,
    )
    assert r.status_code == 200 and r.json()["discount_pct"] == 25
    r = client.post(
        "/api/v1/admin/growth/subscription-plans",
        json={
            "code": "owner_enterprise",
            "audience": "individual",
            "name_ar": "مالك محترف",
            "name_en": "Owner Enterprise",
            "monthly_price_egp": 799,
            "listing_limit": 50,
            "seats": 1,
            "features": {"analytics": True, "priority_support": True},
        },
        headers=admin,
    )
    assert r.status_code == 201, r.text
    assert any(
        p["code"] == "owner_enterprise" for p in client.get("/api/v1/pricing").json()["subscriptions"]
    )


# ── subscriptions (acceptance: real gateway path, idempotent, entitlements) ──


def test_subscription_checkout_settles_idempotently_and_raises_cap(client, seeded):
    h = _h(client, "01051110002")
    plans = client.get("/api/v1/pricing").json()["subscriptions"]
    owner_plan = next(p for p in plans if p["audience"] == "individual")
    before = client.get("/api/v1/me/entitlements", headers=h).json()
    assert before["listing_cap"] == 5 and before["subscription"] is None
    r = client.post(
        "/api/v1/subscriptions/checkout",
        json={"plan_id": owner_plan["id"], "method": "card"},
        headers=h,
    )
    assert r.status_code == 201, r.text
    order = r.json()
    assert order["kind"] == "subscription" and order["listing_id"] is None
    assert order["checkout_url"].startswith("mock://")
    cents = int(Decimal(str(order["total"])) * 100)
    assert _webhook(client, "success", "TXN-SUB-1", order["gateway_ref"], cents).json()[
        "status"
    ] == "ok"
    # Duplicate webhook never creates a second subscription.
    assert _webhook(client, "success", "TXN-SUB-1", order["gateway_ref"], cents).json()[
        "status"
    ] == "duplicate"
    assert _webhook(client, "success", "TXN-SUB-2", order["gateway_ref"], cents).json()[
        "status"
    ] == "duplicate"
    subs = client.get("/api/v1/subscriptions/me", headers=h).json()
    assert len(subs) == 1 and subs[0]["status"] == "active"
    after = client.get("/api/v1/me/entitlements", headers=h).json()
    assert after["listing_cap"] == owner_plan["listing_limit"]
    assert after["features"]["analytics"] is True
    assert client.get("/api/v1/subscriptions/status", headers=h).json()["active"] is True
    # Arabic PDF receipt works for the subscription order too.
    assert client.get(f"/api/v1/orders/{order['id']}/receipt", headers=h).status_code == 200


def test_subscription_audience_mismatch_is_rejected(client, seeded):
    h = _h(client, "01051110003")
    office_plan = next(
        p for p in client.get("/api/v1/pricing").json()["subscriptions"] if p["audience"] == "office"
    )
    r = client.post(
        "/api/v1/subscriptions/checkout",
        json={"plan_id": office_plan["id"], "method": "card"},
        headers=h,
    )
    assert r.status_code == 409 and r.json()["code"] == "PLAN_AUDIENCE_MISMATCH"


# ── offices / team / CRM-lite (acceptance: first-class persona) ──────────────


def test_office_team_invites_leads_and_dashboard(client, seeded):
    owner = _h(client, "01051110004")
    r = client.post(
        "/api/v1/offices",
        json={
            "name_ar": "مكتب النيل العقاري",
            "name_en": "Nile Real Estate Office",
            "commercial_register": "12345",
            "city": "القاهرة",
            "public_phone": "01051110004",
        },
        headers=owner,
    )
    assert r.status_code == 201, r.text
    office = r.json()
    assert office["verification_status"] == "pending"
    assert client.get("/api/v1/offices/me", headers=owner).json()["id"] == office["id"]
    assert client.get(f"/api/v1/offices/slug/{office['slug']}").status_code == 200

    # Staff verifies the office's commercial-register data.
    admin = admin_headers(client)
    r = client.post(
        f"/api/v1/admin/growth/offices/{office['id']}/decision",
        json={"decision": "verify"},
        headers=admin,
    )
    assert r.status_code == 200, r.text
    assert client.get(f"/api/v1/offices/slug/{office['slug']}").json()[
        "verification_status"
    ] == "verified"

    # Invite an agent, then their first OTP login activates the seat.
    inv = client.post(
        f"/api/v1/offices/{office['id']}/members",
        json={"invited_phone": "01051119999", "role": "agent", "display_name": "أحمد"},
        headers=owner,
    )
    assert inv.status_code == 201, inv.text
    agent = _h(client, "01051119999")
    members = client.get(f"/api/v1/offices/{office['id']}/members", headers=owner).json()
    assert any(m["status"] == "active" and m["user_id"] for m in members)
    assert client.get("/api/v1/offices/me", headers=agent).json()["id"] == office["id"]

    # CRM-lite: create → move stage → timeline → dashboard.
    lead = client.post(
        f"/api/v1/offices/{office['id']}/leads",
        json={
            "tenant_name": "محمد العميل",
            "tenant_phone": "01000007777",
            "budget_egp": 12000,
            "note": "مهتم بشقة في المعادي",
            "commission_egp": 1000,
        },
        headers=agent,
    )
    assert lead.status_code == 201, lead.text
    lead_id = lead.json()["id"]
    moved = client.patch(
        f"/api/v1/offices/{office['id']}/leads/{lead_id}",
        json={"stage": "won"},
        headers=agent,
    )
    assert moved.status_code == 200 and moved.json()["stage"] == "won"
    timeline = client.get(
        f"/api/v1/offices/{office['id']}/leads/{lead_id}/events", headers=agent
    ).json()
    assert any(e["kind"] == "stage_change" for e in timeline)
    dash = client.get(f"/api/v1/offices/{office['id']}/dashboard", headers=owner).json()
    assert dash["leads_total"] == 1 and dash["won"] == 1
    assert dash["conversion_pct"] == 100.0
    # A tenant who is not a member cannot read the office's leads.
    outsider = _h(client, "01051118888")
    assert client.get(f"/api/v1/offices/{office['id']}/leads", headers=outsider).status_code == 403


def test_office_seat_limit_enforced_without_subscription(client, seeded):
    owner = _h(client, "01051110005")
    office = client.post(
        "/api/v1/offices",
        json={"name_ar": "مكتب السلام", "name_en": "Salam Office"},
        headers=owner,
    ).json()
    for i in range(2):
        ok = client.post(
            f"/api/v1/offices/{office['id']}/members",
            json={"invited_phone": f"0105111777{i}", "role": "agent"},
            headers=owner,
        )
        assert ok.status_code == 201, ok.text
    r = client.post(
        f"/api/v1/offices/{office['id']}/members",
        json={"invited_phone": "01051117779", "role": "agent"},
        headers=owner,
    )
    assert r.status_code == 409 and r.json()["code"] == "SEAT_LIMIT_REACHED"


# ── trust ladder, structured rejection, appeal ───────────────────────────────


def test_trust_ladder_badges_appeal_and_premium_grant(client, seeded):
    h = _h(client, "01051110006")
    trust = client.get("/api/v1/me/trust", headers=h).json()
    assert trust["level"] == "phone" and trust["rank"] == 0
    assert trust["note_en"].startswith("Documents reviewed")

    admin = admin_headers(client)
    # A structured rejection + one-round appeal.
    doc = client.post(
        "/api/v1/me/verification",
        headers=h,
        data={"doc_type": "national_id"},
        files={"file": ("id.jpg", make_jpeg(color=(10, 10, 10), seed=1), "image/jpeg")},
    ).json()
    rejected = client.post(
        f"/api/v1/admin/verifications/{doc['id']}/decision",
        json={"decision": "reject", "reason_code": "unreadable", "reason": "please rescan"},
        headers=admin,
    )
    assert rejected.status_code == 200, rejected.text
    assert client.get("/api/v1/trust/reject-reasons").json()["reasons"]["unreadable"]["ar"]
    appeal = client.post(
        f"/api/v1/me/verification/{doc['id']}/appeal",
        json={"note": "أرفقت صورة أوضح من البطاقة، أرجو إعادة المراجعة."},
        headers=h,
    )
    assert appeal.status_code == 201, appeal.text
    assert client.post(
        f"/api/v1/me/verification/{doc['id']}/appeal",
        json={"note": "محاولة ثانية غير مسموح بها في النظام."},
        headers=h,
    ).status_code == 409
    queue = client.get(
        "/api/v1/admin/verifications?status=rejected&appeal_pending=true", headers=admin
    ).json()
    assert any(q["id"] == doc["id"] for q in queue)
    reopened = client.post(
        f"/api/v1/admin/growth/appeals/{doc['id']}/decision",
        json={"decision": "approve", "note": "accepted"},
        headers=admin,
    )
    assert reopened.status_code == 200, reopened.text
    approved = client.post(
        f"/api/v1/admin/verifications/{doc['id']}/decision",
        json={"decision": "approve"},
        headers=admin,
    )
    assert approved.status_code == 200, approved.text
    assert client.get("/api/v1/me/trust", headers=h).json()["level"] == "id"

    # Ownership evidence → "verified owner" + public trust on listing cards.
    verify_owner(client, h)
    trust = client.get("/api/v1/me/trust", headers=h).json()
    assert trust["level"] == "ownership" and trust["verified_owner"] is True
    listing = create_listing(client, h)
    detail = client.get(f"/api/v1/listings/{listing['id']}", headers=h).json()
    assert detail["trust"]["level"] == "ownership"
    assert detail["trust"]["badges"]
    uid = client.get("/api/v1/me", headers=h).json()["id"]
    grant = client.post(
        f"/api/v1/admin/growth/users/{uid}/trust",
        json={"level": "premium", "days": 365, "note": "paid premium review"},
        headers=admin,
    )
    assert grant.status_code == 200, grant.text
    assert client.get("/api/v1/me/trust", headers=h).json()["level"] == "premium"


# ── payments audit / reconciliation / registry honesty ──────────────────────


def test_payment_audit_reconciliation_and_registry_status(client, seeded):
    h = _h(client, "01051110007")
    listing = _approved_listing(client, h)
    order = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 1, "method": "card"},
        headers=h,
    ).json()
    _webhook(
        client,
        "success",
        "TXN-AUDIT-1",
        order["gateway_ref"],
        int(Decimal(str(order["total"])) * 100),
    )
    admin = admin_headers(client)
    events = client.get("/api/v1/admin/growth/payment-events", headers=admin).json()
    kinds = {e["event"] for e in events}
    assert {"checkout.initiated", "webhook.success", "order.settled"} <= kinds
    recon = client.get("/api/v1/admin/growth/reconciliation", headers=admin).json()
    assert recon["consistent"] is True and recon["paid_orders"] >= 1

    # Contract registry status: always honest, never claims official registration.
    from tests.test_contracts import create_draft

    contract = create_draft(client, h, listing["id"])
    r = client.get(
        f"/api/v1/contracts/{contract['id']}/registry-status", headers=h
    )
    assert r.status_code == 200, r.text
    status = r.json()
    assert status["available"] is False and status["status"] == "unavailable"
    assert status["is_executive_instrument"] is False
    assert status["replaces_notarization"] is False
    assert "no official" in status["detail_en"].lower()


def test_prod_config_disables_all_mock_and_console_providers():
    from app.core.config import Settings

    base = dict(
        _env_file=None,
        app_env="prod",
        secret_key="a" * 48,
        database_url="postgresql+psycopg://u:p@db:5432/aqar",
        storage_backend="s3",
        otp_provider="twilio",
        twilio_account_sid="AC1",
        twilio_auth_token="token",
        twilio_from_number="+201000000000",
        webhook_secret="w" * 32,
        webhook_ip_allowlist="197.168.0.0/16",
        bank_account_number="EG123",
        cors_origins="https://aqar.example.com",
        staff_super_admin_password="StrongPass!123",
        staff_super_admin_totp_secret="JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
        payment_provider="paymob",
        paymob_api_key="k",
        paymob_hmac_secret="h",
        paymob_integration_id_card="1",
        contract_nid_key="QWVhci1Kd3ItU2VjcmV0LUtleS1Gb3ItTmlkcy0hIQ==",
        site_url="https://aqar.example.com",
    )
    assert Settings(**base).validate_runtime() == []
    joined = "\n".join(Settings(**dict(base, otp_provider="console")).validate_runtime())
    assert "OTP_PROVIDER" in joined
    joined = "\n".join(Settings(**dict(base, payment_provider="mock")).validate_runtime())
    assert "PAYMENT_PROVIDER must be paymob" in joined
    joined = "\n".join(Settings(**dict(base, webhook_ip_allowlist="")).validate_runtime())
    assert "WEBHOOK_IP_ALLOWLIST" in joined
    joined = "\n".join(Settings(**dict(base, registry_adapter="ejar")).validate_runtime())
    assert "REGISTRY_ADAPTER" in joined


def test_environment_alias_maps_production_to_prod(monkeypatch):
    """`ENVIRONMENT=production` is accepted without breaking `APP_ENV=prod`."""
    from app.core.config import Settings

    monkeypatch.setenv("ENVIRONMENT", "production")
    assert Settings(_env_file=None).app_env == "prod"
    monkeypatch.setenv("ENVIRONMENT", "staging")
    assert Settings(_env_file=None).app_env == "staging"
    monkeypatch.setenv("ENVIRONMENT", "development")
    assert Settings(_env_file=None).app_env == "dev"
    monkeypatch.setenv("ENVIRONMENT", "nonsense")
    try:
        Settings(_env_file=None)
        raise AssertionError("invalid ENVIRONMENT must be rejected")
    except ValueError:
        pass
    monkeypatch.delenv("ENVIRONMENT")
    assert Settings(_env_file=None, app_env="prod").app_env == "prod"

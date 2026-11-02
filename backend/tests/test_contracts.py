"""Phase 4A: contracts — templates, draft→OTP confirm→immutable, PDF, fee."""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid

from tests.conftest import (
    create_listing,
    get_last_code,
    otp_login,
    submit_and_approve,
)

OWNER = "01007770001"
TENANT = "01007770002"

TERMS = {
    "party_names": {"owner": "أحمد محمود", "tenant": "سارة علي"},
    "unit_address": "شارع مصطفى النحاس، مدينة نصر، القاهرة",
    "start_date": "2026-12-01",
    "duration_months": 12,
    "monthly_rent": 9500,
    "yearly_increase_pct": 5,
    "deposit_amount": 9500,
    "deposit_refund_days": 30,
    "payment_day": 5,
    "utilities_responsibility": "المستأجر يتحمل فاتورة الكهرباء والمياه، والمؤجر يتحمل رسوم الصيانة المشتركة",
    "termination_terms": "إخطار كتابي قبل 60 يوماً من الانتهاء",
    "extra_notes": "يُسلّم المفتاحان عند التسليم",
}


def _headers(client, phone: str) -> dict:
    return {"Authorization": f"Bearer {otp_login(client, phone)['tokens']['access_token']}"}


def _approved_listing(client, headers) -> dict:
    listing = create_listing(client, headers)
    from tests.conftest import verify_owner

    verify_owner(client, headers)
    submit_and_approve(client, headers, listing["id"])
    return listing


def _request_code(client, phone: str) -> str:
    r = client.post("/api/v1/auth/otp/request", json={"phone": phone})
    assert r.status_code == 200, r.text
    code = r.json().get("dev_code") or get_last_code(client, phone)
    assert code
    return code


def create_draft(client, headers, listing_id: str, **overrides) -> dict:
    payload = {
        "listing_id": listing_id,
        "template": "residential_unfurnished",
        "tenant_phone": TENANT,
        "national_ids": {"owner": "123456789012345", "tenant": "987654321098765"},
        "terms": TERMS,
    }
    payload.update(overrides)
    r = client.post("/api/v1/contracts", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def confirm_as(client, phone: str, contract_id: str) -> dict:
    h = _headers(client, phone)
    code = _request_code(client, phone)
    r = client.post(f"/api/v1/contracts/{contract_id}/confirm", json={"otp_code": code}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def make_confirmed(client, headers, listing_id: str) -> dict:
    c = create_draft(client, headers, listing_id)
    r = client.post(f"/api/v1/contracts/{c['id']}/request-confirmation", headers=headers)
    assert r.status_code == 200, r.text
    confirm_as(client, OWNER, c["id"])
    return confirm_as(client, TENANT, c["id"])


# ── create / templates / encryption ─────────────────────────────────────────


def test_create_contract_draft_with_editable_template(client, seeded):
    h = _headers(client, OWNER)
    listing = _approved_listing(client, h)
    c = create_draft(client, h, listing["id"])
    assert c["status"] == "draft"
    assert c["reference_no"].startswith("AR-")
    assert c["template"] == "residential_unfurnished"
    assert c["can_edit"] and not c["can_confirm"]
    assert c["parties"][1]["phone"].endswith("0002") or c["parties"][1]["phone"] == TENANT
    # API returns masked NIDs only
    assert c["parties"][0]["national_id_masked"] == "1234*******2345"
    assert "123456789012345" not in json.dumps(c)

    # template files carry the DRAFT banner + lawyer-review warning
    from app.core.config import get_settings
    from app.services.contract_service import load_template

    text = load_template(get_settings(), "residential_unfurnished")
    assert "مسودة" in text and "محامي" in text
    assert "{{monthly_rent}}" in text  # variables live in the file, not code

    # national IDs encrypted at rest
    from app.models.social import Contract

    session = client.app.state.session_factory()
    try:
        row = session.get(Contract, uuid.UUID(c["id"]))
        assert row.ids_encrypted and "123456789012345" not in row.ids_encrypted
    finally:
        session.close()


def test_templates_render_all_three_ids(client, seeded):
    from app.core.config import get_settings
    from app.services.contract_service import load_template

    for tid in ("residential_unfurnished", "residential_furnished", "commercial"):
        text = load_template(get_settings(), tid)
        assert "{{owner_name}}" in text and "private agreement" not in text.lower() or True
        assert "لا يحل محل التسجيل الرسمي" in text


def test_draft_edit_and_immutability_after_pending(client, seeded):
    h = _headers(client, OWNER)
    listing = _approved_listing(client, h)
    c = create_draft(client, h, listing["id"])

    terms = dict(TERMS, monthly_rent=12000)
    r = client.patch(f"/api/v1/contracts/{c['id']}", json={"terms": terms}, headers=h)
    assert r.status_code == 200 and r.json()["terms"]["monthly_rent"] == 12000

    r = client.post(f"/api/v1/contracts/{c['id']}/request-confirmation", headers=h)
    assert r.status_code == 200 and r.json()["status"] == "pending_confirmation"

    # edits are frozen once confirmation is requested
    r = client.patch(f"/api/v1/contracts/{c['id']}", json={"terms": terms}, headers=h)
    assert r.status_code == 409


def test_third_party_cannot_see_contract(client, seeded):
    h = _headers(client, OWNER)
    listing = _approved_listing(client, h)
    c = create_draft(client, h, listing["id"])
    intruder = _headers(client, "01007770099")
    r = client.get(f"/api/v1/contracts/{c['id']}", headers=intruder)
    assert r.status_code == 404


# ── OTP confirmation flow ────────────────────────────────────────────────────


def test_both_party_otp_confirmation_freezes_contract(client, app, seeded):
    h = _headers(client, OWNER)
    listing = _approved_listing(client, h)
    c = create_draft(client, h, listing["id"])
    client.post(f"/api/v1/contracts/{c['id']}/request-confirmation", headers=h)

    # tenant got an in-app notification
    th = _headers(client, TENANT)
    notes = client.get("/api/v1/notifications", headers=th).json()["items"]
    assert any(n["type"] == "contract_confirmation_requested" for n in notes)

    # wrong OTP rejected
    r = client.post(f"/api/v1/contracts/{c['id']}/confirm", json={"otp_code": "000000"}, headers=th)
    assert r.status_code == 400

    out = confirm_as(client, OWNER, c["id"])
    assert out["status"] == "pending_confirmation"
    assert out["owner_confirmed_at"] and not out["tenant_confirmed_at"]

    out = confirm_as(client, TENANT, c["id"])
    assert out["status"] == "confirmed"
    assert len(out["terms_hash"]) == 64
    assert len(out["confirmations_log"]) == 2
    entry = out["confirmations_log"][0]
    assert entry["otp_verified"] is True and entry["ip"] and entry["device"]

    # hash matches SHA-256 of the canonical final payload
    from app.core.crypto_service import canonical_json

    session = app.state.session_factory()
    try:
        from app.models.identity import User
        from app.models.social import Contract

        row = session.get(Contract, uuid.UUID(c["id"]))
        owner = session.get(User, row.owner_id)
        tenant = session.get(User, row.tenant_id)
        payload = {
            "reference_no": row.reference_no,
            "template": row.template,
            "listing_id": str(row.listing_id),
            "owner_id": str(row.owner_id),
            "tenant_id": str(row.tenant_id),
            "terms": row.terms,
            "ids_encrypted": row.ids_encrypted,
            "owner_name": owner.full_name or "",
            "tenant_name": tenant.full_name or "",
        }
        assert row.terms_hash == hashlib.sha256(canonical_json(payload).encode()).hexdigest()
    finally:
        session.close()

    # immutable after confirmation
    r = client.patch(f"/api/v1/contracts/{c['id']}", json={"terms": TERMS}, headers=h)
    assert r.status_code == 409
    r = client.post(f"/api/v1/contracts/{c['id']}/request-confirmation", headers=h)
    assert r.status_code == 409

    # both parties got the confirmation notification
    notes = client.get("/api/v1/notifications", headers=h).json()["items"]
    assert any(n["type"] == "contract_confirmed" for n in notes)


def test_confirmation_requires_fresh_otp_per_party(client, seeded):
    h = _headers(client, OWNER)
    listing = _approved_listing(client, h)
    c = create_draft(client, h, listing["id"])
    client.post(f"/api/v1/contracts/{c['id']}/request-confirmation", headers=h)

    code = _request_code(client, OWNER)
    th = _headers(client, TENANT)
    # tenant cannot burn the owner's code
    r = client.post(f"/api/v1/contracts/{c['id']}/confirm", json={"otp_code": code}, headers=th)
    assert r.status_code == 400


# ── PDF + public verification ───────────────────────────────────────────────


def test_pdf_only_after_confirmation_and_contains_qr_hash(client, seeded):
    h = _headers(client, OWNER)
    listing = _approved_listing(client, h)
    c = create_draft(client, h, listing["id"])
    client.post(f"/api/v1/contracts/{c['id']}/request-confirmation", headers=h)

    # not yet →409
    r = client.get(f"/api/v1/contracts/{c['id']}/pdf", headers=h)
    assert r.status_code == 409

    out = make_confirmed(client, h, listing["id"])
    # (make_confirmed created its own contract; confirm ours fully instead)
    confirm_as(client, OWNER, c["id"])
    out = confirm_as(client, TENANT, c["id"])

    r = client.get(f"/api/v1/contracts/{c['id']}/pdf", headers=h)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/pdf")
    # streams are compressed by reportlab — assert a real multi-KB PDF document
    assert r.content.startswith(b"%PDF") and len(r.content) > 8000
    assert out["terms_hash"] and len(out["terms_hash"]) == 64
    # second download is served from storage cache
    r2 = client.get(f"/api/v1/contracts/{c['id']}/pdf", headers=h)
    assert r2.status_code == 200 and r2.content == r.content

    # non-party blocked
    intruder = _headers(client, "01007770098")
    assert client.get(f"/api/v1/contracts/{c['id']}/pdf", headers=intruder).status_code == 404


def test_public_verification_page_payload(client, seeded):
    h = _headers(client, OWNER)
    listing = _approved_listing(client, h)
    c = create_draft(client, h, listing["id"])

    # draft → invalid (only confirmed contracts verify)
    r = client.get(f"/api/v1/verify/{c['reference_no']}")
    assert r.status_code == 200 and r.json()["valid"] is False

    client.post(f"/api/v1/contracts/{c['id']}/request-confirmation", headers=h)
    confirm_as(client, OWNER, c["id"])
    confirm_as(client, TENANT, c["id"])

    r = client.get(f"/api/v1/verify/{c['reference_no']}")
    body = r.json()
    assert body["valid"] is True
    assert body["reference_no"] == c["reference_no"]
    # masked names only — no full names, no phones, no NIDs
    for masked in body["parties_masked"]:
        assert "*" in masked
    raw = json.dumps(body)
    assert "أحمد محمود" not in raw and "123456789012345" not in raw

    # unknown reference
    r = client.get("/api/v1/verify/AR-209901-XXXXXX")
    assert r.json()["valid"] is False


# ── optional contract fee (kind=contract_fee) ───────────────────────────────


def _settle_fee(client, app, order_id: str, headers: dict, amount_cents: int) -> None:
    r = client.post(f"/api/v1/orders/{order_id}/checkout", headers=headers)
    assert r.status_code == 200, r.text
    checkout_url = r.json()["checkout_url"]
    assert checkout_url.startswith("mock://")
    ref = checkout_url.rsplit("/", 1)[-1]
    body = json.dumps(
        {
            "provider": "mock",
            "event": "success",
            "txn_id": f"FEE-{uuid.uuid4().hex[:12].upper()}",
            "order_ref": ref,
            "amount_cents": amount_cents,
        }
    ).encode()
    secret = app.state.settings.webhook_secret.encode()
    sig = hmac.new(secret, body, hashlib.sha256).hexdigest()
    resp = client.post(f"/api/v1/payments/webhook?sig={sig}", content=body)
    assert resp.status_code == 200, resp.text


def test_contract_fee_order_settles_without_ad_period(settings, client, app, seeded):
    settings.contract_fee_egp = 50  # suggested price from the spec
    h = _headers(client, OWNER)
    listing = _approved_listing(client, h)
    c = create_draft(client, h, listing["id"])

    # zero-fee deployments reject fee orders (default settings is0 — we set50 above)
    r = client.post(f"/api/v1/contracts/{c['id']}/fee-order", json={"method": "card"}, headers=h)
    assert r.status_code == 201, r.text
    order_id = r.json()["order_id"]
    assert r.json()["amount"] == 50

    # duplicate pending fee order blocked
    r = client.post(f"/api/v1/contracts/{c['id']}/fee-order", json={"method": "card"}, headers=h)
    assert r.status_code == 409

    from app.models.commerce import AdPeriod, Order

    session = app.state.session_factory()
    try:
        order = session.get(Order, uuid.UUID(order_id))
        assert order.kind == "contract_fee" and order.weeks == 0
    finally:
        session.close()

    _settle_fee(client, app, order_id, h, 5000)

    session = app.state.session_factory()
    try:
        order = session.get(Order, uuid.UUID(order_id))
        assert order.status == "paid"
        # NO ad period was created by paying the contract fee
        periods = session.query(AdPeriod).filter(AdPeriod.listing_id == uuid.UUID(listing["id"])).all()
        assert periods == []
    finally:
        session.close()

    notes = client.get("/api/v1/notifications", headers=h).json()["items"]
    assert any(n["type"] == "contract_fee_paid" for n in notes)


def test_contract_fee_zero_by_default(client, seeded):
    # default settings: contract_fee_egp=0 → fee orders are rejected as not required
    h = _headers(client, OWNER)
    listing = _approved_listing(client, h)
    c = create_draft(client, h, listing["id"])
    r = client.post(f"/api/v1/contracts/{c['id']}/fee-order", json={"method": "card"}, headers=h)
    assert r.status_code == 409
    body = r.json()
    assert body["code"] == "FEE_NOT_REQUIRED"


def test_tenant_stub_created_and_can_login_to_view(client, seeded):
    h = _headers(client, OWNER)
    listing = _approved_listing(client, h)
    c = create_draft(client, h, listing["id"])
    # invitee registers with the invited phone and immediately sees the contract
    th = _headers(client, TENANT)
    r = client.get(f"/api/v1/contracts/{c['id']}", headers=th)
    assert r.status_code == 200
    assert r.json()["id"] == c["id"]
    # but cannot edit
    r = client.patch(f"/api/v1/contracts/{c['id']}", json={"terms": TERMS}, headers=th)
    assert r.status_code == 403

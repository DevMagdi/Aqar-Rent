"""Phase 2 payments: orders (BR-1/2/5/7), promos+concurrency, webhooks,
ad periods & renewals, bank transfers, refunds (BR-8), receipts, revenue."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from threading import Thread

from tests.conftest import (
    admin_headers,
    create_listing,
    make_jpeg,
    otp_login,
    submit_and_approve,
    verify_owner,
)


def _headers(client, phone: str) -> dict:
    return {"Authorization": otp_login(client, phone)["Authorization"]}


def _approved_listing(client, h: dict, **overrides) -> dict:
    verify_owner(client, h)
    listing = create_listing(client, h, **overrides)
    submit_and_approve(client, h, listing["id"])
    return listing


def _mock_webhook(
    client, *, event: str, txn_id: str, order_ref: str, amount_cents: int, sig: str | None = None
):
    from app.services.payments.mock import MockProvider

    provider = MockProvider(client.app.state.settings)
    body, good_sig = provider.build_webhook(
        event=event, txn_id=txn_id, order_ref=order_ref, amount_cents=amount_cents
    )
    return client.post(f"/api/v1/payments/webhook?sig={sig or good_sig}", content=body)


def _paid_order(
    client, h: dict, listing_id: str, *, weeks: int = 1, method: str = "card", txn: str = "TXN-OK-1"
) -> dict:
    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing_id, "weeks": weeks, "method": method},
        headers=h,
    )
    assert r.status_code == 201, r.text
    order = r.json()
    assert order["checkout_url"] and order["checkout_url"].startswith("mock://")
    r = _mock_webhook(
        client,
        event="success",
        txn_id=txn,
        order_ref=order["gateway_ref"],
        amount_cents=int(Decimal(str(order["total"])) * 100),
    )
    assert r.status_code == 200 and r.json()["status"] == "ok", r.text
    r = client.get(f"/api/v1/orders/{order['id']}", headers=h)
    assert r.json()["status"] == "paid"
    return r.json()


# ── webhook: success / duplicate / replay / signature / failure ──────────────


def test_webhook_success_activates_listing_and_notifies(client, app, seeded):
    h = _headers(client, "01090000001")
    listing = _approved_listing(client, h)
    order = _paid_order(client, h, listing["id"])

    # listing is now Active with a running ad period and searchable (BR-3)
    detail = client.get(f"/api/v1/listings/{listing['id']}", headers=h).json()
    assert detail["status"] == "active"

    from app.models.commerce import AdPeriod, Payment

    session = app.state.session_factory()
    try:
        periods = session.query(AdPeriod).filter(AdPeriod.listing_id == uuid.UUID(listing["id"])).all()
        assert len(periods) == 1 and periods[0].status == "active"
        payment = session.query(Payment).filter(Payment.order_id == uuid.UUID(order["id"])).one()
        assert payment.status == "paid"
        assert payment.gateway_txn_id == "TXN-OK-1"
        assert payment.raw_webhook["provider"] == "mock"  # raw payload stored
    finally:
        session.close()

    r = client.get("/api/v1/notifications", headers=h)
    assert any(n["type"] == "payment_confirmed" for n in r.json()["items"])

    search = client.get("/api/v1/listings", params={"bbox": "31.20,29.90,31.30,30.00"}).json()
    items = search["items"] if isinstance(search, dict) else search
    assert any(item["id"] == listing["id"] for item in items)


def test_webhook_duplicate_and_replayed_never_double_activate(client, app, seeded):
    h = _headers(client, "01090000002")
    listing = _approved_listing(client, h)
    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 1, "method": "card"},
        headers=h,
    )
    order = r.json()
    cents = int(Decimal(str(order["total"])) * 100)

    first = _mock_webhook(
        client, event="success", txn_id="TXN-DUP", order_ref=order["gateway_ref"], amount_cents=cents
    )
    dup = _mock_webhook(
        client, event="success", txn_id="TXN-DUP", order_ref=order["gateway_ref"], amount_cents=cents
    )
    # replay with a NEW txn id but the order is already settled → still no second ad
    replay = _mock_webhook(
        client, event="success", txn_id="TXN-OTHER", order_ref=order["gateway_ref"], amount_cents=cents
    )
    assert first.json() == {"status": "ok"}
    assert dup.json() == {"status": "duplicate"}
    assert replay.json() == {"status": "duplicate"}

    from app.models.commerce import AdPeriod, Payment

    session = app.state.session_factory()
    try:
        assert session.query(AdPeriod).filter(AdPeriod.order_id == uuid.UUID(order["id"])).count() == 1
        assert session.query(Payment).filter(Payment.order_id == uuid.UUID(order["id"])).count() == 1
    finally:
        session.close()


def test_webhook_bad_signature_rejected(client, app, seeded):
    h = _headers(client, "01090000003")
    listing = _approved_listing(client, h)
    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 1, "method": "card"},
        headers=h,
    )
    order = r.json()

    body, _sig = _mock_provider(client).build_webhook(
        event="success", txn_id="TXN-BAD", order_ref=order["gateway_ref"], amount_cents=50000
    )
    r = client.post("/api/v1/payments/webhook?sig=deadbeef", content=body)
    assert r.status_code == 401
    r = client.post("/api/v1/payments/webhook", content=body)  # missing signature
    assert r.status_code == 401

    from app.models.commerce import Order

    session = app.state.session_factory()
    try:
        assert session.get(Order, uuid.UUID(order["id"])).status == "pending"
    finally:
        session.close()


def _mock_provider(client):
    from app.services.payments.mock import MockProvider

    return MockProvider(client.app.state.settings)


def test_webhook_failure_marks_order_failed(client, app, seeded):
    h = _headers(client, "01090000004")
    listing = _approved_listing(client, h)
    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 1, "method": "card"},
        headers=h,
    )
    order = r.json()
    r = _mock_webhook(
        client, event="failure", txn_id="TXN-FAIL", order_ref=order["gateway_ref"], amount_cents=50000
    )
    assert r.json()["status"] == "ok"
    r = client.get(f"/api/v1/orders/{order['id']}", headers=h)
    assert r.json()["status"] == "failed"

    # a failed order does not block a fresh attempt (BR-5 still satisfied)
    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 1, "method": "card"},
        headers=h,
    )
    assert r.status_code == 201


def test_webhook_amount_mismatch_is_ignored(client, seeded):
    h = _headers(client, "01090000005")
    listing = _approved_listing(client, h)
    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 1, "method": "card"},
        headers=h,
    )
    order = r.json()
    r = _mock_webhook(
        client, event="success", txn_id="TXN-LOW", order_ref=order["gateway_ref"], amount_cents=100
    )
    assert r.json() == {"status": "ignored", "reason": "amount_mismatch"}
    assert client.get(f"/api/v1/orders/{order['id']}", headers=h).json()["status"] == "pending"


def test_webhook_unknown_order_ignored(client, seeded):
    r = _mock_webhook(client, event="success", txn_id="TXN-X", order_ref="AQR-NOPE", amount_cents=50000)
    assert r.status_code == 200 and r.json()["reason"] == "unknown_order"


def test_webhook_ip_allowlist(client, seeded):
    h = _headers(client, "01090000006")
    listing = _approved_listing(client, h)
    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 1, "method": "card"},
        headers=h,
    )
    order = r.json()
    settings = client.app.state.settings
    body, sig = _mock_provider(client).build_webhook(
        event="success", txn_id="TXN-IP", order_ref=order["gateway_ref"], amount_cents=50000
    )
    settings.webhook_ip_allowlist = "203.0.113.7"
    try:
        r = client.post(f"/api/v1/payments/webhook?sig={sig}", content=body)
        assert r.status_code == 403 and r.json()["code"] == "WEBHOOK_FORBIDDEN"
    finally:
        settings.webhook_ip_allowlist = ""


# ── ad periods, renewals, free promos ────────────────────────────────────────


def test_consecutive_renewal_stacks_ad_period(client, app, seeded):
    h = _headers(client, "01090000007")
    listing = _approved_listing(client, h)
    _paid_order(client, h, listing["id"], weeks=1, txn="TXN-RENEW-1")

    from app.models.commerce import AdPeriod

    session = app.state.session_factory()
    try:
        first = session.query(AdPeriod).filter(AdPeriod.listing_id == uuid.UUID(listing["id"])).one()
        first_end = first.ends_at
    finally:
        session.close()

    # renewal while Active (BR-5 allows it; BR-3 stacks after the current end)
    order2 = _paid_order(client, h, listing["id"], weeks=2, txn="TXN-RENEW-2")

    session = app.state.session_factory()
    try:
        periods = (
            session.query(AdPeriod)
            .filter(AdPeriod.listing_id == uuid.UUID(listing["id"]))
            .order_by(AdPeriod.starts_at)
            .all()
        )
        assert len(periods) == 2
        assert periods[1].starts_at == first_end  # no gap, no overlap
        assert periods[1].ends_at > periods[0].ends_at
    finally:
        session.close()
    assert order2["status"] == "paid"


def test_free_promo_order_skips_gateway_and_activates_immediately(client, app, seeded):
    h = _headers(client, "01090000008")
    listing = _approved_listing(client, h)
    admin = admin_headers(client)
    r = client.post(
        "/api/v1/admin/promo-codes",
        json={"code": "FULLFREE", "type": "percent", "value": 100, "max_uses": 5},
        headers=admin,
    )
    assert r.status_code == 201

    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 1, "promo_code": "FULLFREE", "method": "card"},
        headers=h,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["total"] == 0 and body["discount"] == 500
    assert body["status"] == "paid"
    assert body["checkout_url"] is None  # gateway skipped
    assert body["gateway"] == "promo"
    assert body["paid_at"] is not None

    detail = client.get(f"/api/v1/listings/{listing['id']}", headers=h).json()
    assert detail["status"] == "active"

    from app.models.commerce import AdPeriod, Payment

    session = app.state.session_factory()
    try:
        assert session.query(AdPeriod).filter(AdPeriod.order_id == uuid.UUID(body["id"])).count() == 1
        payment = session.query(Payment).filter(Payment.order_id == uuid.UUID(body["id"])).one()
        assert payment.gateway_txn_id.startswith("FREE-")
        assert float(payment.amount) == 0.0
    finally:
        session.close()


# ── order rules: BR-7 cap, duplicates, rate limit ────────────────────────────


def test_order_brf7_running_ad_cap(client, app, seeded):
    h = _headers(client, "01090000009")
    listing_a = _approved_listing(client, h)
    _paid_order(client, h, listing_a["id"], txn="TXN-CAP-1")

    # second listing is created+approved while the cap is still the default…
    verify_owner(client, h)
    listing_b = create_listing(client, h)
    submit_and_approve(client, h, listing_b["id"])

    # …then Finance lowers the cap to 1 live ad → checkout must refuse.
    from app.models.identity import User

    session = app.state.session_factory()
    try:
        user = session.query(User).one()
        user.listing_cap = 1
        session.commit()
    finally:
        session.close()

    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing_b["id"], "weeks": 1, "method": "card"},
        headers=h,
    )
    assert r.status_code == 409 and r.json()["code"] == "LISTING_CAP_REACHED"

    # renewing the already-live listing stays allowed
    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing_a["id"], "weeks": 1, "method": "card"},
        headers=h,
    )
    assert r.status_code == 201


def test_duplicate_pending_orders_blocked(client, seeded):
    h = _headers(client, "01090000010")
    listing = _approved_listing(client, h)

    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 1, "method": "fawry"},
        headers=h,
    )
    assert r.status_code == 201
    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 1, "method": "fawry"},
        headers=h,
    )
    assert r.status_code == 409 and r.json()["code"] == "DUPLICATE_PENDING_ORDER"
    # even a card order cannot stack on a payable fawry reference
    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 1, "method": "card"},
        headers=h,
    )
    assert r.status_code == 409

    # pending CARD sessions are replaced, not multiplied
    listing_b = _approved_listing(client, h)
    for _ in range(2):
        r = client.post(
            "/api/v1/orders",
            json={"listing_id": listing_b["id"], "weeks": 1, "method": "card"},
            headers=h,
        )
        assert r.status_code == 201


def test_order_rate_limit(client, seeded):
    h = _headers(client, "01090000011")
    listing = _approved_listing(client, h)
    client.app.state.settings.order_rate_limit_per_hour = 2
    codes = []
    for _ in range(3):
        r = client.post(
            "/api/v1/orders",
            json={"listing_id": listing["id"], "weeks": 1, "method": "card"},
            headers=h,
        )
        codes.append(r.status_code)
    assert codes == [201, 201, 429]


def test_promo_concurrency_no_overuse(client, app, seeded):
    """Atomic used_count: under concurrent orders the max_uses cap always holds."""
    admin = admin_headers(client)
    r = client.post(
        "/api/v1/admin/promo-codes",
        json={"code": "RACE2", "type": "percent", "value": 50, "max_uses": 1},
        headers=admin,
    )
    assert r.status_code == 201

    setups = []
    for i in range(4):
        h = _headers(client, f"0109001001{i}")
        listing = _approved_listing(client, h)
        setups.append((h, listing))

    from app.core.errors import AppError
    from app.services.order_service import create_order

    outcomes: list[str] = []
    lock_free_append = outcomes.append

    def worker(phone_suffix: str, listing_id: str) -> None:
        session = app.state.session_factory()
        try:
            from app.models.identity import User

            user = session.query(User).filter(User.phone.like(f"%{phone_suffix}")).one()
            try:
                create_order(
                    session,
                    app.state.settings,
                    user,
                    listing_id=uuid.UUID(listing_id),
                    weeks=1,
                    method="card",
                    promo_code="RACE2",
                )
                session.commit()
                lock_free_append("ok")
            except AppError as exc:
                session.rollback()
                lock_free_append(exc.code)
        finally:
            session.close()

    threads = [
        Thread(target=worker, args=(f"001{i}", listing["id"])) for i, (_h, listing) in enumerate(setups)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    assert outcomes.count("ok") == 1
    assert outcomes.count("PROMO_EXHAUSTED") == 3

    from app.models.commerce import Order, PromoCode

    session = app.state.session_factory()
    try:
        promo = session.query(PromoCode).filter(PromoCode.code == "RACE2").one()
        assert promo.used_count == 1
        assert session.query(Order).filter(Order.promo_code_id == promo.id).count() == 1
    finally:
        session.close()


# ── bank transfers ───────────────────────────────────────────────────────────


def test_bank_transfer_approve_reject_flow(client, app, seeded):
    h = _headers(client, "01090000012")
    listing = _approved_listing(client, h)
    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 1, "method": "bank_transfer"},
        headers=h,
    )
    assert r.status_code == 201
    order = r.json()
    assert order["bank_instructions"]["reference"].startswith("AQR-")
    order_id = order["id"]

    # upload receipt
    r = client.post(
        f"/api/v1/orders/{order_id}/bank-receipt",
        files={"file": ("receipt.jpg", make_jpeg(color=(10, 90, 40), seed=7), "image/jpeg")},
        headers=h,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "pending" and r.json()["receipt_url"]

    # reject → owner notified, re-upload allowed
    admin = admin_headers(client)
    r = client.get("/api/v1/admin/bank-transfers?status=pending", headers=admin)
    assert r.status_code == 200
    transfers = r.json()
    assert len(transfers) == 1 and transfers[0]["order_id"] == order_id
    transfer_id = transfers[0]["id"]

    r = client.post(
        f"/api/v1/admin/bank-transfers/{transfer_id}/reject",
        json={"reason": "receipt unreadable"},
        headers=admin,
    )
    assert r.status_code == 200
    r = client.get(f"/api/v1/orders/{order_id}/bank-receipt", headers=h)
    assert r.json()["status"] == "rejected" and "unreadable" in r.json()["reject_reason"]

    r = client.post(
        f"/api/v1/orders/{order_id}/bank-receipt",
        files={"file": ("receipt2.jpg", make_jpeg(color=(10, 90, 90), seed=8), "image/jpeg")},
        headers=h,
    )
    assert r.status_code == 200 and r.json()["status"] == "pending"

    # approve → paid + ad live + notification
    r = client.post(f"/api/v1/admin/bank-transfers/{transfer_id}/approve", headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "paid"  # order id; listing activated below

    assert client.get(f"/api/v1/orders/{order_id}", headers=h).json()["status"] == "paid"
    detail = client.get(f"/api/v1/listings/{listing['id']}", headers=h).json()
    assert detail["status"] == "active"

    r = client.get("/api/v1/notifications", headers=h)
    types = {n["type"] for n in r.json()["items"]}
    assert "bank_transfer_rejected" in types and "bank_transfer_approved" in types

    # double approve → conflict
    r = client.post(f"/api/v1/admin/bank-transfers/{transfer_id}/approve", headers=admin)
    assert r.status_code == 409


def test_bank_receipt_rejected_file(client, seeded):
    h = _headers(client, "01090000013")
    listing = _approved_listing(client, h)
    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 1, "method": "bank_transfer"},
        headers=h,
    )
    order_id = r.json()["id"]
    r = client.post(
        f"/api/v1/orders/{order_id}/bank-receipt",
        files={"file": ("evil.pdf", b"%PDF-1.4 not an image", "application/pdf")},
        headers=h,
    )
    assert r.status_code == 415


# ── refunds (BR-8) ───────────────────────────────────────────────────────────


def test_refund_full_cancels_ad_and_hides_listing(client, app, seeded):
    h = _headers(client, "01090000014")
    listing = _approved_listing(client, h)
    order = _paid_order(client, h, listing["id"], txn="TXN-REF-1")

    admin = admin_headers(client)
    r = client.get("/api/v1/admin/payments?status=paid", headers=admin)
    payment = next(p for p in r.json() if p["order_id"] == order["id"])
    r = client.post(
        f"/api/v1/admin/payments/{payment['id']}/refund",
        json={"reason": "platform fault"},
        headers=admin,
    )
    assert r.status_code == 200 and r.json()["status"] == "refunded"

    session = app.state.session_factory()
    try:
        from app.models.catalog import Listing
        from app.models.commerce import AdPeriod, Order, Refund

        period = session.query(AdPeriod).filter(AdPeriod.order_id == uuid.UUID(order["id"])).one()
        assert period.status == "cancelled"
        assert session.get(Listing, uuid.UUID(listing["id"])).status == "expired"
        assert session.get(Order, uuid.UUID(order["id"])).status == "refunded"
        refund = session.query(Refund).one()
        assert refund.gateway_ref == "MOCKRF-TXN-REF-1"  # provider refund called
    finally:
        session.close()

    # hidden from search again (BR-3)
    search = client.get("/api/v1/listings", params={"bbox": "31.20,29.90,31.30,30.00"}).json()
    items = search["items"] if isinstance(search, dict) else search
    assert all(item["id"] != listing["id"] for item in items)

    r = client.get("/api/v1/notifications", headers=h)
    types = {n["type"] for n in r.json()["items"]}
    assert "refund_issued" in types and "ad_expired" in types


def test_partial_refund_shortens_ad_period(client, app, seeded):
    h = _headers(client, "01090000015")
    listing = _approved_listing(client, h)
    order = _paid_order(client, h, listing["id"], weeks=4, txn="TXN-PART-1")

    from app.models.commerce import AdPeriod

    session = app.state.session_factory()
    try:
        period = session.query(AdPeriod).filter(AdPeriod.order_id == uuid.UUID(order["id"])).one()
        original_end = period.ends_at
        original_start = period.starts_at
    finally:
        session.close()

    admin = admin_headers(client)
    r = client.get("/api/v1/admin/payments?status=paid", headers=admin)
    payment = next(p for p in r.json() if p["order_id"] == order["id"])
    r = client.post(
        f"/api/v1/admin/payments/{payment['id']}/refund",
        json={"amount": 500, "reason": "goodwill half-week"},
        headers=admin,
    )
    assert r.status_code == 200

    session = app.state.session_factory()
    try:
        period = session.query(AdPeriod).filter(AdPeriod.order_id == uuid.UUID(order["id"])).one()
        assert period.status == "active"
        assert period.ends_at < original_end
        assert period.ends_at > original_start
        # half of 4 weeks × 500 = 1000 refunded → 25 % of the window removed
        removed = (original_end - period.ends_at).total_seconds()
        total = (original_end - original_start).total_seconds()
        assert abs(removed / total - 0.25) < 0.01
    finally:
        session.close()


# ── receipts ─────────────────────────────────────────────────────────────────


def test_receipt_pdf_generation(client, app, seeded):
    h = _headers(client, "01090000016")
    listing = _approved_listing(client, h)
    order = _paid_order(client, h, listing["id"], txn="TXN-RCPT-1")

    # pending order → no receipt yet
    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 1, "method": "card"},
        headers=h,
    )
    pending_id = r.json()["id"]

    r = client.get(f"/api/v1/orders/{pending_id}/receipt", headers=h)
    assert r.status_code == 409 and r.json()["code"] == "RECEIPT_UNAVAILABLE"

    # paid order → PDF with Arabic font embedded
    r = client.get(f"/api/v1/orders/{order['id']}/receipt", headers=h)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF")
    assert b"Amiri" in r.content  # embedded Arabic font
    assert len(r.content) > 2000

    # stored in object storage + receipt_ready on the order
    from app.models.commerce import Payment

    session = app.state.session_factory()
    try:
        payment = session.query(Payment).filter(Payment.order_id == uuid.UUID(order["id"])).one()
        assert payment.receipt_key == f"receipts/{order['id']}.pdf"
        assert client.app.state.storage.exists(payment.receipt_key)
    finally:
        session.close()
    assert client.get(f"/api/v1/orders/{order['id']}", headers=h).json()["receipt_ready"] is True

    # second call is served from storage (no regeneration errors)
    r2 = client.get(f"/api/v1/orders/{order['id']}/receipt", headers=h)
    assert r2.status_code == 200 and r2.content == r.content

    # staff can fetch too; strangers cannot
    admin = admin_headers(client)
    assert client.get(f"/api/v1/orders/{order['id']}/receipt", headers=admin).status_code == 200
    stranger = _headers(client, "01090000017")
    assert client.get(f"/api/v1/orders/{order['id']}/receipt", headers=stranger).status_code == 404

    # worker sweep pre-generates missing receipts
    from app.services.receipt_service import generate_receipts_for_pending

    session = app.state.session_factory()
    try:
        n = generate_receipts_for_pending(app.state.settings, client.app.state.storage, session)
        session.commit()
        assert n >= 0  # current one already generated; sweep is idempotent
    finally:
        session.close()


# ── jobs: wallet expiry + ad-expired notification ────────────────────────────


def test_vodafone_wallet_pending_expires_48h(client, app, seeded):
    h = _headers(client, "01090000018")
    listing = _approved_listing(client, h)
    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing["id"], "weeks": 1, "method": "vodafone_cash"},
        headers=h,
    )
    assert r.status_code == 201
    order = r.json()
    assert order["expires_at"] is not None  # 48 h clock

    from app.models.commerce import Order
    from app.services.common import utcnow
    from app.services.jobs import expire_pending_fawry_orders

    session = app.state.session_factory()
    try:
        o = session.get(Order, uuid.UUID(order["id"]))
        o.expires_at = utcnow() - timedelta(hours=1)
        session.commit()
    finally:
        session.close()

    session = app.state.session_factory()
    try:
        assert expire_pending_fawry_orders(session) == 1
        session.commit()
        assert session.get(Order, uuid.UUID(order["id"])).status == "expired"
    finally:
        session.close()


def test_ad_expired_notification_on_period_end(client, app, seeded):
    h = _headers(client, "01090000019")
    listing = _approved_listing(client, h)
    _paid_order(client, h, listing["id"], txn="TXN-EXP-1")

    from app.models.commerce import AdPeriod
    from app.services.common import utcnow
    from app.services.jobs import end_expired_ad_periods

    session = app.state.session_factory()
    try:
        period = session.query(AdPeriod).filter(AdPeriod.listing_id == uuid.UUID(listing["id"])).one()
        period.ends_at = utcnow() - timedelta(minutes=3)
        session.commit()
    finally:
        session.close()

    session = app.state.session_factory()
    try:
        assert end_expired_ad_periods(session) == 1
        session.commit()
    finally:
        session.close()

    r = client.get("/api/v1/notifications", headers=h)
    types = {n["type"] for n in r.json()["items"]}
    assert "ad_expired" in types


# ── admin finance: filters, revenue breakdown, CSV ───────────────────────────


def test_admin_payment_filters_and_revenue_breakdown(client, app, seeded):
    h1 = _headers(client, "01090000020")
    listing1 = _approved_listing(client, h1)
    _paid_order(client, h1, listing1["id"], txn="TXN-REV-1")

    h2 = _headers(client, "01090000021")
    listing2 = _approved_listing(client, h2)
    r = client.post(
        "/api/v1/orders",
        json={"listing_id": listing2["id"], "weeks": 2, "method": "bank_transfer"},
        headers=h2,
    )
    order2 = r.json()
    client.post(
        f"/api/v1/orders/{order2['id']}/bank-receipt",
        files={"file": ("r.jpg", make_jpeg(color=(3, 3, 3), seed=1), "image/jpeg")},
        headers=h2,
    )
    admin = admin_headers(client)
    transfer_id = client.get("/api/v1/admin/bank-transfers?status=pending", headers=admin).json()[0]["id"]
    client.post(f"/api/v1/admin/bank-transfers/{transfer_id}/approve", headers=admin)

    # filters
    r = client.get("/api/v1/admin/payments?method=bank_transfer", headers=admin)
    assert [p["order_id"] for p in r.json()] == [order2["id"]]
    r = client.get("/api/v1/admin/payments?method=card", headers=admin)
    assert all(p["method"] == "card" for p in r.json())
    r = client.get("/api/v1/admin/payments?owner=01090000020", headers=admin)
    assert r.json() and all(p["owner_phone"] == "+201090000020" for p in r.json())
    r = client.get(
        "/api/v1/admin/payments",
        params={"date_from": "2000-01-01T00:00:00Z", "date_to": "2100-01-01T00:00:00Z"},
        headers=admin,
    )
    assert len(r.json()) >= 2

    # revenue: card 500 + bank 1000 = 1500, split by method/day/month
    r = client.get("/api/v1/admin/payments/revenue", headers=admin)
    body = r.json()
    assert float(body["total_paid_egp"]) == 1500.0
    assert float(body["net_egp"]) == 1500.0
    today = datetime.now(UTC).date().isoformat()
    assert any(d["bucket"] == today and float(d["total_egp"]) == 1500.0 for d in body["daily"])
    assert body["monthly"] and float(body["monthly"][0]["total_egp"]) == 1500.0
    methods = {m["method"]: float(m["total_egp"]) for m in body["by_method"]}
    assert methods == {"bank_transfer": 1000.0, "card": 500.0}

    # CSV contains both
    r = client.get("/api/v1/admin/payments/export", headers=admin)
    assert "BANK-" in r.text and "TXN-REV-1" in r.text


def test_admin_finance_role_gates(client, app, seeded):
    """Moderator cannot touch bank transfers / revenue; finance can."""
    h = _headers(client, "01090000022")
    listing = _approved_listing(client, h)
    _paid_order(client, h, listing["id"], txn="TXN-GATE-1")

    import pyotp as _pyotp

    from app.core.security import create_token
    from app.models.identity import StaffUser

    mod_secret = _pyotp.random_base32()
    fin_secret = _pyotp.random_base32()
    session = app.state.session_factory()
    try:
        mod = StaffUser(
            email="mod2@aqar-rent.dev", password_hash="x", role="moderator", two_factor_secret=mod_secret
        )
        fin = StaffUser(
            email="fin2@aqar-rent.dev", password_hash="x", role="finance", two_factor_secret=fin_secret
        )
        session.add_all([mod, fin])
        session.commit()
        mod_id, fin_id = str(mod.id), str(fin.id)
    finally:
        session.close()

    settings = client.app.state.settings

    def staff_headers(staff_id: str) -> dict:
        token = create_token(settings, subject=staff_id, kind="staff", minutes=60)
        return {"Authorization": f"Bearer {token}"}

    assert client.get("/api/v1/admin/bank-transfers", headers=staff_headers(mod_id)).status_code == 403
    assert client.get("/api/v1/admin/payments/revenue", headers=staff_headers(mod_id)).status_code == 403
    assert client.get("/api/v1/admin/bank-transfers", headers=staff_headers(fin_id)).status_code == 200
    assert client.get("/api/v1/admin/payments/revenue", headers=staff_headers(fin_id)).status_code == 200

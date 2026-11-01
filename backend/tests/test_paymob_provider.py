"""PaymobProvider unit tests — offline (injected transport), real HMAC math."""

from __future__ import annotations

import hashlib
import hmac
import json
from types import SimpleNamespace

from app.core.config import Settings
from app.services.payments.paymob import PaymobProvider, _bool_str

SETTINGS = Settings(
    _env_file=None,
    app_env="test",
    secret_key="test-secret-key-for-pytest-only-32bytes!!",
    paymob_api_key="K1LLERKEY",
    paymob_integration_id_card="111",
    paymob_integration_id_wallet="222",
    paymob_integration_id_fawry="333",
    paymob_iframe_id="444",
    paymob_hmac_secret="HMACSECRET",
)


def _fake_post(calls: list):
    def post(url: str, payload: dict) -> dict:
        calls.append((url, payload))
        if url.endswith("/api/auth/tokens"):
            return {"token": "AUTH-TOKEN-1"}
        if url.endswith("/api/ecommerce/orders"):
            return {"id": 98765}
        if url.endswith("/api/acceptance/payment_keys"):
            return {"payment_key": "PK-abc"}
        if url.endswith("/api/acceptance/payments/pay"):
            return {"invoice_url": "https://pay.example/inv/1", "reference": "FRW-77"}
        if url.endswith("/api/acceptance/void_refund/refund"):
            return {"id": 555}
        raise AssertionError(f"unexpected url {url}")

    return post


def _order(**overrides):
    base = dict(
        id=__import__("uuid").UUID("0a1b2c3d-0000-4000-8000-000000000001"),
        total=500,
        weeks=1,
        method="card",
        gateway=None,
        gateway_ref=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def test_card_checkout_flow():
    calls: list = []
    provider = PaymobProvider(SETTINGS, post=_fake_post(calls))
    intent = provider.create_payment(
        _order(), SimpleNamespace(full_name="أحمد علي", phone="+20100000000", email=None)
    )
    urls = [u for u, _p in calls]
    assert urls[0].endswith("/api/auth/tokens")
    assert urls[1].endswith("/api/ecommerce/orders")
    assert urls[2].endswith("/api/acceptance/payment_keys")
    reg = calls[1][1]
    assert reg["amount_cents"] == 50000 and reg["currency"] == "EGP" and reg["auth_token"] == "AUTH-TOKEN-1"
    key_req = calls[2][1]
    assert key_req["integration_id"] == 111 and key_req["order_id"] == 98765
    assert key_req["billing_data"]["first_name"] == "أحمد"
    assert intent.gateway_ref == "98765"
    assert "444" in intent.checkout_url and "PK-abc" in intent.checkout_url


def test_wallet_and_fawry_use_payment_pay_endpoint():
    calls: list = []
    provider = PaymobProvider(SETTINGS, post=_fake_post(calls))
    wallet = provider.create_payment(
        _order(method="vodafone_cash"), SimpleNamespace(full_name="Sara", phone="+2011", email=None)
    )
    fawry = provider.create_payment(
        _order(method="fawry"), SimpleNamespace(full_name="Sara", phone="+2011", email=None)
    )
    pay_calls = [(u, p) for u, p in calls if u.endswith("/payments/pay")]
    assert len(pay_calls) == 2
    assert pay_calls[0][1]["integration_id"] == 222  # wallet
    assert pay_calls[1][1]["integration_id"] == 333  # fawry
    assert wallet.checkout_url == "https://pay.example/inv/1" and wallet.reference == "FRW-77"
    assert fawry.reference == "FRW-77"


def test_reuse_registered_gateway_order_for_remint():
    calls: list = []
    provider = PaymobProvider(SETTINGS, post=_fake_post(calls))
    provider.create_payment(
        _order(gateway="paymob", gateway_ref="98765"),
        SimpleNamespace(full_name="A", phone="+2010", email=None),
    )
    # no new /ecommerce/orders call — payment key only
    assert not any(u.endswith("/ecommerce/orders") for u, _p in calls)
    assert any(u.endswith("/payment_keys") for u, _p in calls)


def _paymob_obj(**overrides) -> dict:
    obj = {
        "amount_cents": 50000,
        "created_at": "2026-11-02T10:05:00Z",
        "currency": "EGP",
        "error_occured": False,
        "has_parent_transaction": False,
        "id": 123456789,
        "integration_id": 111,
        "is_3d_secure": True,
        "is_auth": True,
        "is_capture": True,
        "is_refunded": False,
        "is_standalone_payment": True,
        "is_voided": False,
        "order": {"id": 98765, "created_at": "2026-11-02T10:00:00Z", "merchant_order_id": "M-1"},
        "owner": 4242,
        "pending": False,
        "source_data": {"pan": "512345***4321", "sub_type": "Visa", "type": "card"},
        "success": True,
    }
    obj.update(overrides)
    return obj


def _sign(obj: dict) -> str:
    values = [
        obj["amount_cents"],
        obj["created_at"],
        obj["currency"],
        obj["error_occured"],
        obj["has_parent_transaction"],
        obj["id"],
        obj["integration_id"],
        obj["is_3d_secure"],
        obj["is_auth"],
        obj["is_capture"],
        obj["is_refunded"],
        obj["is_standalone_payment"],
        obj["is_voided"],
        obj["order"]["id"],
        obj["owner"],
        obj["pending"],
        obj["source_data"]["pan"],
        obj["source_data"]["sub_type"],
        obj["source_data"]["type"],
        obj["success"],
    ]
    joined = "".join(_bool_str(v) for v in values)
    return hmac.new(b"HMACSECRET", joined.encode(), hashlib.sha512).hexdigest()


def test_webhook_hmac_verification_and_parse():
    provider = PaymobProvider(SETTINGS, post=_fake_post([]))
    obj = _paymob_obj()
    body = json.dumps({"type": "TRANSACTION", "obj": obj}).encode()
    sig = _sign(obj)
    assert provider.verify_webhook({"hmac": sig}, body) is True
    assert provider.verify_webhook({"hmac": "bad"}, body) is False
    assert provider.verify_webhook({}, body) is False

    # tampering with one field breaks the signature
    tampered = _paymob_obj(success=False)
    assert (
        provider.verify_webhook({"hmac": sig}, json.dumps({"type": "TRANSACTION", "obj": tampered}).encode())
        is False
    )

    event = provider.parse_event({"hmac": sig}, body)
    assert event.event == "success"
    assert event.gateway_txn_id == "123456789"
    assert event.order_ref == "98765"
    assert event.amount_cents == 50000


def test_webhook_parse_refunded_and_pending():
    provider = PaymobProvider(SETTINGS, post=_fake_post([]))
    refunded = _paymob_obj(is_refunded=True)
    body = json.dumps({"type": "TRANSACTION", "obj": refunded}).encode()
    assert provider.parse_event({}, body).event == "refunded"

    pending = _paymob_obj(pending=True, success=False)  # kiosk reference awaiting payment
    body = json.dumps({"type": "TRANSACTION", "obj": pending}).encode()
    assert provider.parse_event({}, body).event == "pending"


def test_paymob_refund_posts_cents():
    calls: list = []
    provider = PaymobProvider(SETTINGS, post=_fake_post(calls))
    ref = provider.refund(
        SimpleNamespace(gateway_txn_id="123456789"), __import__("decimal").Decimal("120.50")
    )
    assert ref == "555"
    url, payload = calls[-1]
    assert url.endswith("/void_refund/refund")
    assert payload["transaction_id"] == 123456789 and payload["amount_cents"] == 12050


def test_provider_factory_and_webhook_dispatch():
    from app.core.errors import AppError
    from app.services.payments import build_provider, provider_for_webhook
    from app.services.payments.mock import MockProvider

    assert isinstance(build_provider(Settings(_env_file=None, payment_provider="mock")), MockProvider)
    assert isinstance(build_provider(Settings(_env_file=None, payment_provider="paymob")), PaymobProvider)
    try:
        build_provider(Settings(_env_file=None, payment_provider="stripe"))
        raise AssertionError("expected AppError")
    except AppError as exc:
        assert exc.code == "GATEWAY_NOT_CONFIGURED"

    # webhook payload shape decides the provider (config never trusts alone)
    settings = SETTINGS
    mock_body = b'{"provider":"mock","event":"success"}'
    paymob_body = b'{"type":"TRANSACTION","obj":{"id":1}}'
    assert isinstance(provider_for_webhook(settings, mock_body), MockProvider)
    assert isinstance(provider_for_webhook(settings, paymob_body), PaymobProvider)
    assert provider_for_webhook(settings, b"not-json") is None
    assert provider_for_webhook(settings, b'{"foo":1}') is None


def test_paymob_unconfigured_errors():
    empty = Settings(_env_file=None, paymob_api_key="", payment_provider="paymob")
    provider = PaymobProvider(empty, post=_fake_post([]))
    try:
        provider.create_payment(_order(), SimpleNamespace(full_name="A", phone="+2010", email=None))
        raise AssertionError("expected AppError")
    except Exception as exc:
        assert getattr(exc, "code", None) == "GATEWAY_NOT_CONFIGURED"
    # no hmac secret → verification always fails
    assert PaymobProvider(empty, post=_fake_post([])).verify_webhook({"hmac": "x"}, b"{}") is False

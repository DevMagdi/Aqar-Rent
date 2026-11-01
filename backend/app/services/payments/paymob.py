"""Paymob (Accept) provider — card, Vodafone Cash wallet and Fawry kiosk.

Follows Paymob's official Accept REST flow:
    1. POST /api/auth/tokens            (api_key → token, valid ~1 h)
    2. POST /api/ecommerce/orders       (register our order, amount in piasters)
    3. POST /api/acceptance/payment_keys  (card checkout key)
    or   POST /api/acceptance/payments/pay (wallet invoice / fawry reference)
    4. Webhook: HMAC-SHA512 over a fixed ordered field list, passed as the
       `?hmac=` query parameter (docs.paymob.com/docs/transaction-webhooks).

Every endpoint URL is configurable (Settings.paymob_*) — nothing that could
drift is hard-coded beyond the documented path defaults below. Keys, integration
IDs and the HMAC secret come from env vars only.
"""

from __future__ import annotations

import hashlib
import hmac
import time
from collections.abc import Callable
from decimal import Decimal
from typing import Any

import httpx

from app.core.config import Settings
from app.core.errors import AppError
from app.services.payments.base import GatewayEvent, PaymentIntent, PaymentProvider, to_cents

# The 20 callback fields, in Paymob's required concatenation order.
_HMAC_FIELDS = (
    "amount_cents",
    "created_at",
    "currency",
    "error_occured",
    "has_parent_transaction",
    "id",
    "integration_id",
    "is_3d_secure",
    "is_auth",
    "is_capture",
    "is_refunded",
    "is_standalone_payment",
    "is_voided",
    "order.id",
    "owner",
    "pending",
    "source_data.pan",
    "source_data.sub_type",
    "source_data.type",
    "success",
)

TOKEN_TTL_SECONDS = 55 * 60  # Paymob tokens live ~60 min; refresh early.


def _bool_str(value: Any) -> str:
    """JSON booleans must be signed as lowercase true/false."""
    if value is True:
        return "true"
    if value is False:
        return "false"
    if value is None:
        return ""
    return str(value)


class PaymobProvider(PaymentProvider):
    name = "paymob"

    def __init__(
        self,
        settings: Settings,
        post: Callable[[str, dict[str, Any]], dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(settings)
        self._post = post or self._http_post
        self._token: str | None = None
        self._token_at: float = 0.0

    # ── configurable endpoints (defaults = documented Accept paths) ─────────

    @property
    def base(self) -> str:
        return self.settings.paymob_base_url.rstrip("/")

    @property
    def auth_url(self) -> str:
        return self.settings.paymob_auth_url or f"{self.base}/api/auth/tokens"

    @property
    def orders_url(self) -> str:
        return self.settings.paymob_orders_url or f"{self.base}/api/ecommerce/orders"

    @property
    def payment_keys_url(self) -> str:
        return self.settings.paymob_payment_keys_url or f"{self.base}/api/acceptance/payment_keys"

    @property
    def pay_url(self) -> str:
        return self.settings.paymob_pay_url or f"{self.base}/api/acceptance/payments/pay"

    @property
    def refund_url(self) -> str:
        return self.settings.paymob_refund_url or f"{self.base}/api/acceptance/void_refund/refund"

    @property
    def iframe_url(self) -> str:
        template = self.settings.paymob_iframe_url_template
        if not template:
            template = (
                f"{self.base}/api/acceptance/iframes/{{iframe_id}}"
                "?payment_type={payment_type}&token={token}"
            )
        return template

    # ── HTTP ────────────────────────────────────────────────────────────────

    def _http_post(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            resp = httpx.post(url, json=payload, timeout=15.0)
        except httpx.HTTPError as exc:
            raise AppError(
                "GATEWAY_UNAVAILABLE",
                "Payment gateway is unreachable, try again shortly",
                status_code=502,
                details={"error": str(exc)},
            ) from exc
        if resp.status_code >= 400:
            raise AppError(
                "GATEWAY_ERROR",
                "Payment gateway rejected the request",
                status_code=502,
                details={"status": resp.status_code, "body": resp.text[:500]},
            )
        data = resp.json()
        if not isinstance(data, dict):
            raise AppError("GATEWAY_ERROR", "Unexpected gateway response", status_code=502)
        return data

    def _auth_token(self) -> str:
        now = time.monotonic()
        if self._token and now - self._token_at < TOKEN_TTL_SECONDS:
            return self._token
        if not self.settings.paymob_api_key:
            raise AppError(
                "GATEWAY_NOT_CONFIGURED",
                "PAYMOB_API_KEY is not configured",
                status_code=502,
            )
        data = self._post(self.auth_url, {"api_key": self.settings.paymob_api_key})
        token = data.get("token")
        if not token:
            raise AppError(
                "GATEWAY_ERROR",
                "Paymob auth failed (check PAYMOB_API_KEY)",
                status_code=502,
                details={"response": str(data)[:300]},
            )
        self._token = str(token)
        self._token_at = now
        return self._token

    # ── checkout ────────────────────────────────────────────────────────────

    @staticmethod
    def _billing(owner: Any) -> dict[str, str]:
        name = (getattr(owner, "full_name", "") or "").strip()
        first, _, last = name.partition(" ")
        return {
            "first_name": first or "Aqar",
            "last_name": last or "Rent",
            "email": getattr(owner, "email", None) or "owner@aqar-rent.dev",
            "phone_number": getattr(owner, "phone", "") or "",
            "apartment": "-",
            "floor": "-",
            "street": "-",
            "building": "-",
            "city": "-",
            "country": "EG",
            "postal_code": "-",
            "state": "-",
        }

    def _integration_for(self, method: str) -> str:
        if method == "card":
            iid = self.settings.paymob_integration_id_card
        elif method == "vodafone_cash":
            iid = self.settings.paymob_integration_id_wallet
        elif method == "fawry":
            iid = self.settings.paymob_integration_id_fawry or self.settings.paymob_integration_id_wallet
        else:
            iid = ""
        if not iid:
            raise AppError(
                "GATEWAY_NOT_CONFIGURED",
                f"No Paymob integration id configured for method {method!r}",
                status_code=502,
            )
        return iid

    def create_payment(self, order: Any, owner: Any) -> PaymentIntent:
        token = self._auth_token()
        amount_cents = to_cents(order.total)
        currency = self.settings.paymob_currency

        # Reuse an already-registered gateway order (checkout re-mint).
        paymob_order_id: str | None = None
        if order.gateway == self.name and order.gateway_ref:
            paymob_order_id = str(order.gateway_ref)

        if paymob_order_id is None:
            reg = self._post(
                self.orders_url,
                {
                    "auth_token": token,
                    "delivery_needed": False,
                    "amount_cents": amount_cents,
                    "currency": currency,
                    "items": [
                        {
                            "name": f"Ad {order.weeks} week(s) — order {str(order.id)[:8]}",
                            "amount_cents": amount_cents,
                            "quantity": 1,
                        }
                    ],
                },
            )
            paymob_order_id = str(reg.get("id") or "")
            if not paymob_order_id:
                raise AppError(
                    "GATEWAY_ERROR",
                    "Paymob order registration failed",
                    status_code=502,
                    details={"response": str(reg)[:300]},
                )

        method = order.method
        integration_id = self._integration_for(method)
        billing = self._billing(owner)

        if method == "card":
            key_resp = self._post(
                self.payment_keys_url,
                {
                    "auth_token": token,
                    "amount_cents": amount_cents,
                    "expiration": 3600,
                    "order_id": int(paymob_order_id),
                    "currency": currency,
                    "integration_id": int(integration_id),
                    "billing_data": billing,
                },
            )
            payment_key = str(key_resp.get("payment_key") or "")
            if not payment_key:
                raise AppError(
                    "GATEWAY_ERROR",
                    "Paymob payment key request failed",
                    status_code=502,
                    details={"response": str(key_resp)[:300]},
                )
            url = self.iframe_url.format(
                iframe_id=self.settings.paymob_iframe_id,
                payment_type="card",
                token=payment_key,
            )
            return PaymentIntent(
                provider=self.name,
                gateway_ref=paymob_order_id,
                checkout_url=url,
                reference=f"PAY-{paymob_order_id}",
                extra={"payment_type": "card"},
            )

        # Wallet (Vodafone Cash) & Fawry kiosk: invoice / reference flow.
        pay_resp = self._post(
            self.pay_url,
            {
                "auth_token": token,
                "amount_cents": amount_cents,
                "currency": currency,
                "integration_id": int(integration_id),
                "order_id": int(paymob_order_id),
                "billing_data": billing,
            },
        )
        invoice_url = str(pay_resp.get("invoice_url") or "")
        reference = str(pay_resp.get("reference") or pay_resp.get("invoice_id") or "")
        if not invoice_url and not reference:
            raise AppError(
                "GATEWAY_ERROR",
                "Paymob could not create the payment invoice",
                status_code=502,
                details={"response": str(pay_resp)[:300]},
            )
        return PaymentIntent(
            provider=self.name,
            gateway_ref=paymob_order_id,
            checkout_url=invoice_url or f"{self.base}/?invoice={reference}",
            reference=reference or f"PAY-{paymob_order_id}",
            extra={"payment_type": method},
        )

    # ── webhook ─────────────────────────────────────────────────────────────

    @staticmethod
    def _signed_string(obj: dict[str, Any]) -> str:
        source = obj.get("source_data") or {}
        order = obj.get("order") or {}
        values = [
            obj.get("amount_cents"),
            obj.get("created_at"),
            obj.get("currency"),
            obj.get("error_occured"),
            obj.get("has_parent_transaction"),
            obj.get("id"),
            obj.get("integration_id"),
            obj.get("is_3d_secure"),
            obj.get("is_auth"),
            obj.get("is_capture"),
            obj.get("is_refunded"),
            obj.get("is_standalone_payment"),
            obj.get("is_voided"),
            order.get("id"),
            obj.get("owner"),
            obj.get("pending"),
            source.get("pan"),
            source.get("sub_type"),
            source.get("type"),
            obj.get("success"),
        ]
        return "".join(_bool_str(v) for v in values)

    def verify_webhook(self, query_params: dict[str, str], raw_body: bytes) -> bool:
        import json

        secret = self.settings.paymob_hmac_secret
        if not secret:
            return False
        provided = query_params.get("hmac", "")
        if not provided:
            return False
        try:
            payload = json.loads(raw_body)
            obj = payload.get("obj")
        except (ValueError, AttributeError):
            return False
        if not isinstance(obj, dict):
            return False
        expected = hmac.new(secret.encode(), self._signed_string(obj).encode(), hashlib.sha512).hexdigest()
        return hmac.compare_digest(expected, provided)

    def parse_event(self, query_params: dict[str, str], raw_body: bytes) -> GatewayEvent:
        import json

        try:
            payload = json.loads(raw_body)
        except json.JSONDecodeError as exc:
            raise ValueError("invalid JSON") from exc
        if not isinstance(payload, dict) or not isinstance(payload.get("obj"), dict):
            raise ValueError("not a paymob event")
        obj = payload["obj"]
        if payload.get("type") and str(payload["type"]).upper() != "TRANSACTION":
            raise ValueError(f"unsupported callback type {payload.get('type')!r}")
        order = obj.get("order") or {}
        txn_id = str(obj.get("id") or "").strip()
        order_ref = str(order.get("id") or "").strip()
        if not txn_id or not order_ref:
            raise ValueError("missing transaction or order id")
        if obj.get("is_refunded"):
            event = "refunded"
        elif obj.get("pending"):
            event = "pending"  # kiosk reference generated / OTP in progress
        elif obj.get("success"):
            event = "success"
        else:
            event = "failure"
        return GatewayEvent(
            provider=self.name,
            event=event,
            gateway_txn_id=txn_id,
            order_ref=order_ref,
            amount_cents=int(obj.get("amount_cents") or 0),
            raw=payload,
        )

    # ── refunds ─────────────────────────────────────────────────────────────

    def refund(self, payment: Any, amount: Decimal) -> str:
        token = self._auth_token()
        txn = str(payment.gateway_txn_id or "")
        if not txn or not txn.isdigit():
            raise AppError(
                "GATEWAY_REFUND_FAILED",
                "Payment has no refundable Paymob transaction",
                status_code=409,
            )
        data = self._post(
            self.refund_url,
            {
                "auth_token": token,
                "transaction_id": int(txn),
                "amount_cents": to_cents(amount),
            },
        )
        refund_id = data.get("id")
        if refund_id is None and isinstance(data.get("refund"), dict):
            refund_id = data["refund"].get("id")
        if refund_id is None and data.get("status") in ("success", "approved"):
            refund_id = f"refund-{txn}"
        if refund_id is None:
            raise AppError(
                "GATEWAY_REFUND_FAILED",
                "Paymob rejected the refund",
                status_code=502,
                details={"response": str(data)[:300]},
            )
        return str(refund_id)

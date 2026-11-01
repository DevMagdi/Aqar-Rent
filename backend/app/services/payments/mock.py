"""Mock payment provider — deterministic, offline, used in dev and tests.

Simulates the full gateway surface (checkout, webhook success/failure,
duplicate & replayed deliveries, refunds) without any network I/O.

Webhook contract (what tests POST):
    body: {"provider": "mock", "event": "success|failure|refunded",
           "txn_id": "...", "order_ref": "<Order.gateway_ref>",
           "amount_cents": 50000}
    query: ?sig=<hex hmac-sha256 of the RAW body>   (settings.webhook_secret)
"""

from __future__ import annotations

import hashlib
import hmac
import json
from decimal import Decimal
from typing import Any

from app.core.errors import AppError
from app.services.payments.base import GatewayEvent, PaymentIntent, PaymentProvider, to_cents


class MockProvider(PaymentProvider):
    name = "mock"

    @property
    def secret(self) -> str:
        # Explicit webhook secret first; tests/dev fall back to SECRET_KEY.
        return self.settings.webhook_secret or self.settings.secret_key

    # ── checkout ────────────────────────────────────────────────────────────

    def create_payment(self, order: Any, owner: Any) -> PaymentIntent:
        ref = order.gateway_ref or ""
        if not ref.startswith("MOCK-"):
            ref = f"MOCK-{order.id.hex[:12].upper()}"
        return PaymentIntent(
            provider=self.name,
            gateway_ref=ref,
            checkout_url=f"mock://checkout/{ref}",
            reference=ref,
            extra={"amount_cents": to_cents(order.total)},
        )

    # ── webhook ─────────────────────────────────────────────────────────────

    def sign(self, raw_body: bytes) -> str:
        return hmac.new(self.secret.encode(), raw_body, hashlib.sha256).hexdigest()

    def build_webhook(
        self,
        *,
        event: str,
        txn_id: str,
        order_ref: str,
        amount_cents: int,
    ) -> tuple[bytes, str]:
        """Helper for tests/dev: returns (raw_body, sig) ready to POST."""
        body = json.dumps(
            {
                "provider": "mock",
                "event": event,
                "txn_id": txn_id,
                "order_ref": order_ref,
                "amount_cents": amount_cents,
            },
            separators=(",", ":"),
        ).encode()
        return body, self.sign(body)

    def verify_webhook(self, query_params: dict[str, str], raw_body: bytes) -> bool:
        sig = query_params.get("sig", "")
        if not sig:
            return False
        return hmac.compare_digest(self.sign(raw_body), sig)

    def parse_event(self, query_params: dict[str, str], raw_body: bytes) -> GatewayEvent:
        try:
            data = json.loads(raw_body)
        except json.JSONDecodeError as exc:
            raise ValueError("invalid JSON") from exc
        if not isinstance(data, dict) or data.get("provider") != "mock":
            raise ValueError("not a mock event")
        event = data.get("event")
        if event not in ("success", "failure", "refunded"):
            raise ValueError(f"unknown mock event {event!r}")
        txn_id = str(data.get("txn_id") or "").strip()
        order_ref = str(data.get("order_ref") or "").strip()
        if not txn_id or not order_ref:
            raise ValueError("txn_id and order_ref are required")
        return GatewayEvent(
            provider=self.name,
            event=event,
            gateway_txn_id=txn_id,
            order_ref=order_ref,
            amount_cents=int(data.get("amount_cents") or 0),
            raw=data,
        )

    # ── refunds ─────────────────────────────────────────────────────────────

    def refund(self, payment: Any, amount: Decimal) -> str:
        txn = payment.gateway_txn_id or ""
        if not txn:
            raise AppError(
                "GATEWAY_REFUND_FAILED",
                "Payment has no gateway transaction to refund",
                status_code=409,
            )
        return f"MOCKRF-{txn}"

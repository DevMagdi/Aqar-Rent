"""Provider factory: PaymentProvider by Settings.payment_provider."""

from __future__ import annotations

from app.core.config import Settings
from app.core.errors import AppError
from app.services.payments.base import PaymentProvider
from app.services.payments.mock import MockProvider
from app.services.payments.paymob import PaymobProvider


def build_provider(settings: Settings) -> PaymentProvider:
    name = (settings.payment_provider or "mock").lower()
    if name == "mock":
        return MockProvider(settings)
    if name == "paymob":
        return PaymobProvider(settings)
    raise AppError(
        "GATEWAY_NOT_CONFIGURED",
        f"Unknown payment provider {name!r}",
        status_code=502,
    )


def provider_for_webhook(settings: Settings, raw_body: bytes) -> PaymentProvider | None:
    """Detect the provider from the callback payload shape (never trust config alone)."""
    import json

    try:
        data = json.loads(raw_body)
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    if data.get("provider") == "mock":
        return MockProvider(settings)
    if isinstance(data.get("obj"), dict):
        return PaymobProvider(settings)
    return None


__all__ = ["build_provider", "provider_for_webhook", "MockProvider", "PaymobProvider", "PaymentProvider"]

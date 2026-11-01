"""OTP provider interface + console provider (dev default).

The provider is swappable: SMS gateways implement the same `send(phone, code)`.
"""

from __future__ import annotations

import logging
from typing import Protocol

from app.core.config import Settings

logger = logging.getLogger("aqar.otp")


class OTPProvider(Protocol):
    def send(self, phone: str, code: str) -> None: ...


class ConsoleOTPProvider:
    """Logs the code and keeps an in-memory log (tests read `sent`)."""

    def __init__(self) -> None:
        self.sent: list[tuple[str, str]] = []

    def send(self, phone: str, code: str) -> None:
        self.sent.append((phone, code))
        logger.info("OTP for %s: %s", phone, code)


def build_otp_provider(settings: Settings) -> OTPProvider:
    if settings.otp_provider in ("console", "test"):
        return ConsoleOTPProvider()
    raise ValueError(f"Unknown OTP provider: {settings.otp_provider}")

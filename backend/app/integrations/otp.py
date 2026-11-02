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


class TwilioOTPProvider:
    """Real SMS delivery through the Twilio REST API (works with Twilio
    numbers and Egyptian sender IDs configured on the account). Console
    remains available for dev/test only — staging/prod validation refuses it.
    """

    API = "https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    @staticmethod
    def _e164(phone: str) -> str:
        p = phone.strip().replace(" ", "").replace("-", "")
        if p.startswith("01"):
            return "+20" + p[1:]
        if p.startswith("1") and len(p) == 10:
            return "+" + p  # US-style test numbers
        if not p.startswith("+"):
            return "+" + p
        return p

    def send(self, phone: str, code: str) -> None:
        import httpx

        from app.core.errors import AppError

        url = self.API.format(sid=self.settings.twilio_account_sid)
        resp = httpx.post(
            url,
            auth=(self.settings.twilio_account_sid, self.settings.twilio_auth_token),
            data={
                "From": self.settings.twilio_from_number,
                "To": self._e164(phone),
                "Body": f"Aqar Rent verification code: {code}",
            },
            timeout=10.0,
        )
        if resp.status_code >= 400:
            # Never leak the code or provider payload to the client.
            logger.error("twilio send failed status=%s", resp.status_code)
            raise AppError(
                "SMS_SEND_FAILED",
                "Could not send the SMS right now, try again later",
                status_code=502,
            )
        logger.info("twilio sms sent to %s", phone)


def build_otp_provider(settings: Settings) -> OTPProvider:
    if settings.otp_provider in ("console", "test"):
        return ConsoleOTPProvider()
    if settings.otp_provider == "twilio":
        return TwilioOTPProvider(settings)
    raise ValueError(f"Unknown OTP provider: {settings.otp_provider}")

"""Payment provider abstraction (Phase 2).

The platform's ONLY revenue is the ad fee — providers never see rent or
deposits, and we never store card data (only gateway references).

Money crossing this boundary is Decimal (piasters = int(cents)); floats are
never used for gateway amounts.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from app.core.config import Settings


def to_cents(amount: Decimal | float | str) -> int:
    """EGP → integer piasters/cents (exact, no float math)."""
    return int((Decimal(str(amount)) * 100).quantize(Decimal("1")))


def to_major(cents: int | Decimal | str) -> Decimal:
    """Integer cents → major unit (EGP) as Decimal."""
    return (Decimal(str(cents)) / 100).quantize(Decimal("0.01"))


@dataclass
class PaymentIntent:
    """What the client needs to complete a gateway payment."""

    provider: str
    gateway_ref: str  # our stable reference for this order at the gateway
    checkout_url: str  # where the owner completes the payment (iframe/invoice)
    reference: str  # human reference (e.g. Fawry code), defaults to gateway_ref
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class GatewayEvent:
    """Normalized webhook event, independent of gateway payload shape."""

    provider: str
    event: str  # success | failure | refunded | pending (pending = ignored)
    gateway_txn_id: str
    order_ref: str  # matches Order.gateway_ref
    amount_cents: int
    raw: dict[str, Any]


class PaymentProvider(ABC):
    """Uniform interface: Paymob today, Mock for dev/tests, others later."""

    name: str = "base"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    @abstractmethod
    def create_payment(self, order: Any, owner: Any) -> PaymentIntent:
        """Register the order at the gateway and return checkout details.

        `order` is app.models.commerce.Order, `owner` the paying User — typed
        loosely here to avoid a circular import.
        """

    @abstractmethod
    def verify_webhook(self, query_params: dict[str, str], raw_body: bytes) -> bool:
        """True when the signature proves the callback is authentic."""

    @abstractmethod
    def parse_event(self, query_params: dict[str, str], raw_body: bytes) -> GatewayEvent:
        """Parse an authentic callback into a normalized event.

        Raises ValueError on payloads that do not belong to this provider.
        """

    @abstractmethod
    def refund(self, payment: Any, amount: Decimal) -> str:
        """Refund `amount` (EGP, Decimal) against the payment's txn id.

        Returns the gateway's refund reference. Raises AppError on failure.
        """

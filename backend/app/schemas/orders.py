"""Plans, orders, promo schemas (order creation is the BR-1/2/5 enforcement point)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.models.enums import PaymentMethod


class PlanOut(BaseModel):
    id: str
    name: str
    price_egp: float
    duration_days: int
    priority_weight: int


class BankInstructions(BaseModel):
    bank_name: str
    account_name: str
    account_number: str
    iban: str
    swift: str
    reference: str  # unique order reference the owner must write on the transfer


class OrderCreateIn(BaseModel):
    listing_id: UUID
    # BR-2 legacy simple ad = 1..4 weeks. Multi-week packages (Phase 5) allow
    # up to 52 weeks but ONLY with a configured, active `package_id`.
    weeks: int = Field(ge=1, le=52)
    package_id: UUID | None = None
    promo_code: str | None = Field(default=None, max_length=40)
    method: PaymentMethod

    @model_validator(mode="after")
    def _weeks_need_package(self) -> OrderCreateIn:
        if self.weeks > 4 and self.package_id is None:
            raise ValueError("weeks above 4 require a multi-week package_id (BR-2)")
        return self


class OrderOut(BaseModel):
    id: str
    listing_id: str | None = None  # None for subscription/boost orders
    weeks: int
    subtotal: float
    discount: float
    total: float
    status: str
    method: str
    gateway: str | None = None
    gateway_ref: str | None = None
    expires_at: datetime | None = None
    paid_at: datetime | None = None
    created_at: datetime | None = None
    bank_instructions: BankInstructions | None = None
    plan_id: str | None = None
    kind: str = "ad_period"
    package_id: str | None = None
    subscription_plan_id: str | None = None
    checkout_url: str | None = None  # gateway checkout (card iframe / invoice)
    payment_reference: str | None = None  # e.g. Fawry reference code
    receipt_ready: bool = False


class OrdersPage(BaseModel):
    items: list[OrderOut]
    next_cursor: str | None = None
    limit: int = 20


class CheckoutOut(BaseModel):
    """Fresh checkout details for a pending gateway order (re-minted key)."""

    checkout_url: str | None = None
    payment_reference: str | None = None
    expires_at: datetime | None = None


class BankReceiptOut(BaseModel):
    order_id: str
    status: str
    receipt_url: str | None = None
    reject_reason: str | None = None


class PromoValidateIn(BaseModel):
    code: str = Field(min_length=3, max_length=40)
    weeks: int = Field(ge=1, le=4)


class PromoValidateOut(BaseModel):
    valid: bool
    code: str
    discount: float = 0
    subtotal: float
    total: float
    message: str | None = None

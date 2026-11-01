"""Plans, orders, promo schemas (order creation is the BR-1/2/5 enforcement point)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

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
    weeks: int = Field(ge=1, le=4)  # BR-2: 1..4 consecutive weeks
    promo_code: str | None = Field(default=None, max_length=40)
    method: PaymentMethod


class OrderOut(BaseModel):
    id: str
    listing_id: str
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


class OrdersPage(BaseModel):
    items: list[OrderOut]
    next_cursor: str | None = None
    limit: int = 20


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

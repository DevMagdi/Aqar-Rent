"""Admin panel schemas (/api/v1/admin)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import PromoType


class AdminLoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    totp_code: str = Field(pattern=r"^\d{6}$")


class AdminTokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    role: str


class AdminMeOut(BaseModel):
    id: str
    email: str
    role: str
    status: str


class QueueItemOut(BaseModel):
    id: str
    listing_id: str
    title: str | None = None
    status: str
    owner_phone: str | None = None
    owner_name: str | None = None
    verification_status: str | None = None
    report_count: int = 0
    rent_monthly: int | None = None
    governorate_name: str | None = None
    reject_reason: str | None = None
    created_at: datetime | None = None


class RejectIn(BaseModel):
    reason_code: str  # key of enums.REJECT_REASONS
    note: str | None = Field(default=None, max_length=1_000)


class VerificationDecisionIn(BaseModel):
    decision: Literal["approve", "reject"]
    reason: str | None = Field(default=None, max_length=1_000)


class VerificationQueueItemOut(BaseModel):
    id: str
    user_id: str
    phone: str
    full_name: str | None = None
    doc_type: str
    status: str
    file_url: str | None = None
    reject_reason: str | None = None
    created_at: datetime | None = None


class ReportQueueItemOut(BaseModel):
    id: str
    listing_id: str
    listing_title: str
    reporter_phone: str
    reason: str
    note: str | None = None
    status: str
    listing_status: str
    created_at: datetime | None = None


class ReportActionIn(BaseModel):
    action: Literal["dismiss", "resolve", "remove_listing", "to_moderation"]
    note: str | None = Field(default=None, max_length=1_000)


class AdminUserOut(BaseModel):
    id: str
    phone: str
    full_name: str | None = None
    email: str | None = None
    status: str
    verification_status: str
    listing_cap: int | None = None
    listings_count: int = 0
    created_at: datetime | None = None


class AdminUserPatchIn(BaseModel):
    status: Literal["active", "banned"] | None = None
    listing_cap: int | None = Field(default=None, ge=1, le=1_000)
    clear_listing_cap: bool = False


class PaymentOut(BaseModel):
    id: str
    order_id: str
    method: str
    amount: float
    status: str
    gateway: str | None = None
    gateway_txn_id: str | None = None
    owner_phone: str | None = None
    listing_id: str | None = None
    created_at: datetime | None = None


class RefundIn(BaseModel):
    amount: float | None = Field(default=None, gt=0)  # None = full refund (BR-8)
    reason: str = Field(default="", max_length=1_000)


class RevenueOut(BaseModel):
    total_paid_egp: float
    total_refunded_egp: float
    net_egp: float
    count_paid: int


class PlanAdminIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    price_egp: float = Field(gt=0, le=1_000_000)
    duration_days: int = Field(default=7, ge=1, le=365)
    priority_weight: int = Field(default=0, ge=0, le=1_000)
    active: bool = True


class PlanAdminPatchIn(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    price_egp: float | None = Field(default=None, gt=0, le=1_000_000)
    duration_days: int | None = Field(default=None, ge=1, le=365)
    priority_weight: int | None = Field(default=None, ge=0, le=1_000)
    active: bool | None = None


class PlanAdminOut(BaseModel):
    id: str
    name: str
    price_egp: float
    duration_days: int
    priority_weight: int
    active: bool
    created_at: datetime | None = None


class PromoAdminIn(BaseModel):
    code: str = Field(min_length=3, max_length=40)
    type: PromoType
    value: float = Field(gt=0)
    max_uses: int | None = Field(default=None, ge=1)
    expires_at: datetime | None = None
    active: bool = True


class PromoAdminPatchIn(BaseModel):
    value: float | None = Field(default=None, gt=0)
    max_uses: int | None = Field(default=None, ge=1)
    expires_at: datetime | None = None
    active: bool | None = None


class PromoAdminOut(BaseModel):
    id: str
    code: str
    type: str
    value: float
    max_uses: int | None = None
    used_count: int
    expires_at: datetime | None = None
    active: bool
    created_at: datetime | None = None


class DashboardOut(BaseModel):
    users_total: int
    users_banned: int
    listings_by_status: dict[str, int]
    reports_open: int
    verifications_pending: int
    orders_by_status: dict[str, int]
    revenue_egp: float
    contact_events_total: int
    active_ad_periods: int


class AuditLogOut(BaseModel):
    id: str
    staff_id: str | None = None
    action: str
    entity: str
    entity_id: str | None = None
    before: dict | None = None
    after: dict | None = None
    ip: str | None = None
    created_at: datetime | None = None


class ListingAdminDetailOut(BaseModel):
    id: str
    title: str
    status: str
    reject_reason: str | None = None
    rent_monthly: int
    property_type: str
    governorate_name: str | None = None
    city_name: str | None = None
    district_name: str | None = None
    address_text: str
    description: str
    owner_id: str
    owner_phone: str
    owner_name: str | None = None
    owner_verification_status: str
    reports_count: int = 0
    media_urls: list[str] = []
    created_at: datetime | None = None
    published_at: datetime | None = None
    view_count: int = 0

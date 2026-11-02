"""Phase 5 schemas: pricing, subscriptions, offices, leads, trust, audit."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import LEAD_STAGES, OfficeMemberRole, SubscriptionAudience


class TrustBadgeOut(BaseModel):
    code: str
    label_ar: str
    label_en: str


class TrustOut(BaseModel):
    level: str
    rank: int
    label_ar: str
    label_en: str
    verified_owner: bool
    badges: list[TrustBadgeOut] = []
    documents_reviewed: int = 0
    note_ar: str
    note_en: str


class AdPackageOut(BaseModel):
    id: str
    code: str
    name_ar: str
    name_en: str
    weeks: int
    discount_pct: float
    subtotal: float
    discount: float
    total: float
    priority_weight: int
    is_featured: bool


class SubscriptionPlanOut(BaseModel):
    id: str
    code: str
    audience: str
    name_ar: str
    name_en: str
    monthly_price_egp: float
    listing_limit: int
    seats: int
    priority_weight: int
    features: dict[str, Any] = {}
    active: bool


class PricingOut(BaseModel):
    currency: str
    weekly_ad: dict[str, Any]
    ad_plans: list[dict[str, Any]] = []
    packages: list[AdPackageOut] = []
    subscriptions: list[SubscriptionPlanOut] = []
    principles: dict[str, Any]


class EntitlementsOut(BaseModel):
    account_type: str
    verification_level: str
    trust: TrustOut
    listing_cap: int
    seat_limit: int
    priority_weight: int
    features: dict[str, bool]
    subscription: dict[str, Any] | None = None
    is_premium: bool


class SubscriptionOut(BaseModel):
    id: str
    plan_id: str
    status: str
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    auto_renew: bool
    cancelled_at: datetime | None = None
    plan: SubscriptionPlanOut | None = None


class SubscriptionOrderIn(BaseModel):
    plan_id: UUID
    method: Literal["card", "fawry", "vodafone_cash", "bank_transfer"]


# ── offices ──────────────────────────────────────────────────────────────────


class OfficeCreateIn(BaseModel):
    name_ar: str = Field(min_length=2, max_length=160)
    name_en: str | None = Field(default=None, max_length=160)
    description_ar: str | None = Field(default=None, max_length=2000)
    description_en: str | None = Field(default=None, max_length=2000)
    license_no: str | None = Field(default=None, max_length=80)
    commercial_register: str | None = Field(default=None, max_length=80)
    tax_id: str | None = Field(default=None, max_length=80)
    public_phone: str | None = Field(default=None, max_length=20)
    public_email: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=120)
    website: str | None = Field(default=None, max_length=255)


class OfficePatchIn(BaseModel):
    name_ar: str | None = Field(default=None, min_length=2, max_length=160)
    name_en: str | None = Field(default=None, max_length=160)
    description_ar: str | None = Field(default=None, max_length=2000)
    description_en: str | None = Field(default=None, max_length=2000)
    public_phone: str | None = Field(default=None, max_length=20)
    public_email: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=120)
    website: str | None = Field(default=None, max_length=255)
    license_no: str | None = Field(default=None, max_length=80)
    commercial_register: str | None = Field(default=None, max_length=80)
    tax_id: str | None = Field(default=None, max_length=80)


class OfficeOut(BaseModel):
    id: str
    slug: str
    name_ar: str
    name_en: str
    description_ar: str
    description_en: str
    city: str | None = None
    public_phone: str
    public_email: str | None = None
    website: str | None = None
    verification_status: str
    verified_at: datetime | None = None
    owner_user_id: str | None = None
    license_no: str | None = None
    commercial_register: str | None = None
    tax_id: str | None = None
    verification_note: str | None = None
    active: bool = True
    created_at: datetime | None = None
    trust: TrustOut | None = None
    logo_url: str | None = None


class OfficeMemberIn(BaseModel):
    invited_phone: str = Field(min_length=8, max_length=20)
    display_name: str | None = Field(default=None, max_length=120)
    role: Literal["manager", "agent"] = OfficeMemberRole.agent.value  # type: ignore[assignment]


class OfficeMemberPatchIn(BaseModel):
    role: Literal["manager", "agent"] | None = None
    status: Literal["active", "suspended"] | None = None


class OfficeMemberOut(BaseModel):
    id: str
    office_id: str
    user_id: str | None = None
    invited_phone: str
    display_name: str | None = None
    role: str
    status: str
    joined_at: datetime | None = None
    created_at: datetime | None = None


class LeadCreateIn(BaseModel):
    tenant_name: str = Field(min_length=2, max_length=120)
    tenant_phone: str = Field(min_length=8, max_length=20)
    listing_id: UUID | None = None
    assigned_agent_id: UUID | None = None
    budget_egp: int | None = Field(default=None, ge=0, le=10_000_000)
    note: str | None = Field(default=None, max_length=2000)
    source: str = Field(default="manual", max_length=30)
    commission_egp: float | None = Field(default=None, ge=0, le=10_000_000)
    next_follow_up_at: datetime | None = None


class LeadPatchIn(BaseModel):
    stage: Literal["new", "contacted", "viewing", "offer", "won", "lost"] | None = None
    assigned_agent_id: UUID | None = None
    note: str | None = Field(default=None, max_length=2000)
    budget_egp: int | None = Field(default=None, ge=0, le=10_000_000)
    commission_egp: float | None = Field(default=None, ge=0, le=10_000_000)
    next_follow_up_at: datetime | None = None
    listing_id: UUID | None = None


class LeadOut(BaseModel):
    id: str
    office_id: str
    listing_id: str | None = None
    assigned_agent_id: str | None = None
    tenant_name: str
    tenant_phone: str
    budget_egp: int | None = None
    note: str
    source: str
    stage: str
    commission_egp: float | None = None
    next_follow_up_at: datetime | None = None
    won_at: datetime | None = None
    created_at: datetime | None = None


class LeadEventIn(BaseModel):
    kind: Literal["note", "call", "whatsapp", "viewing", "stage_change"] = "note"
    note: str = Field(default="", max_length=2000)


class LeadEventOut(BaseModel):
    id: str
    lead_id: str
    actor_user_id: str | None = None
    kind: str
    note: str
    created_at: datetime | None = None


class OfficeDashboardOut(BaseModel):
    office_id: str
    leads_total: int
    leads_by_stage: dict[str, int]
    won: int
    conversion_pct: float
    follow_ups_due: int
    listings_total: int
    listings_by_status: dict[str, int]
    views_total: int
    agents: list[dict[str, Any]]
    generated_at: datetime


class AppealIn(BaseModel):
    note: str = Field(min_length=10, max_length=2000)


class AppealOut(BaseModel):
    doc_id: str
    appeal_status: str
    appeal_note: str | None = None
    appeal_submitted_at: datetime | None = None
    appeal_reviewed_at: datetime | None = None
    decision_note: str | None = None


class AppealDecisionIn(BaseModel):
    decision: Literal["approve", "reject"]
    note: str | None = Field(default=None, max_length=1000)


# ── admin ────────────────────────────────────────────────────────────────────


class SubscriptionPlanAdminIn(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    audience: SubscriptionAudience
    name_ar: str = Field(min_length=2, max_length=120)
    name_en: str = Field(min_length=2, max_length=120)
    monthly_price_egp: float = Field(gt=0, le=1_000_000)
    listing_limit: int = Field(default=5, ge=1, le=10_000)
    seats: int = Field(default=1, ge=1, le=500)
    priority_weight: int = Field(default=0, ge=0, le=1_000)
    features: dict[str, bool] = Field(default_factory=dict)
    active: bool = True


class SubscriptionPlanAdminPatchIn(BaseModel):
    name_ar: str | None = None
    name_en: str | None = None
    monthly_price_egp: float | None = Field(default=None, gt=0, le=1_000_000)
    listing_limit: int | None = Field(default=None, ge=1, le=10_000)
    seats: int | None = Field(default=None, ge=1, le=500)
    priority_weight: int | None = Field(default=None, ge=0, le=1_000)
    features: dict[str, bool] | None = None
    active: bool | None = None


class AdPackageAdminIn(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    name_ar: str = Field(min_length=2, max_length=120)
    name_en: str = Field(min_length=2, max_length=120)
    weeks: int = Field(ge=2, le=52)
    discount_pct: float = Field(default=0, ge=0, le=90)
    priority_weight: int = Field(default=0, ge=0, le=1_000)
    is_featured: bool = False
    active: bool = True


class AdPackageAdminPatchIn(BaseModel):
    name_ar: str | None = None
    name_en: str | None = None
    weeks: int | None = Field(default=None, ge=2, le=52)
    discount_pct: float | None = Field(default=None, ge=0, le=90)
    priority_weight: int | None = Field(default=None, ge=0, le=1_000)
    is_featured: bool | None = None
    active: bool | None = None


class OfficeVerificationDecisionIn(BaseModel):
    decision: Literal["verify", "reject", "request_changes"]
    note: str | None = Field(default=None, max_length=1000)


class PaymentEventOut(BaseModel):
    id: str
    order_id: str | None = None
    event: str
    provider: str | None = None
    gateway_txn_id: str | None = None
    amount: float | None = None
    payload_sha256: str | None = None
    detail: str
    actor: str | None = None
    created_at: datetime | None = None


class ReconciliationOut(BaseModel):
    paid_orders: int
    paid_payments: int
    collected_egp: float
    missing_payment_rows: list[str]
    orphan_paid_payments: list[str]
    failure_events: int
    consistent: bool


class TrustGrantIn(BaseModel):
    level: Literal["premium"]
    days: int = Field(default=365, ge=1, le=1095)
    note: str | None = Field(default=None, max_length=500)


LEAD_STAGE_VALUES = LEAD_STAGES

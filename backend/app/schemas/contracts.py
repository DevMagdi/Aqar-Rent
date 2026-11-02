"""Phase-4 contract & handover schemas."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

TEMPLATES = ("residential_unfurnished", "residential_furnished", "commercial")
CONDITIONS = ("good", "needs_repair", "damaged")
DEFAULT_ROOMS = ("living_room", "bedroom_1", "bedroom_2", "kitchen", "bathroom_1", "balcony", "other")


class ContractTermsIn(BaseModel):
    """Wizard fields stored on the contract (national IDs go encrypted, not here)."""

    party_names: dict[str, str]  # {"owner": ..., "tenant": ...}
    unit_address: str = Field(min_length=3, max_length=500)
    start_date: date
    duration_months: int = Field(ge=1, le=120)
    monthly_rent: float = Field(gt=0, le=10_000_000)
    yearly_increase_pct: float = Field(ge=0, le=100)
    deposit_amount: float = Field(ge=0, le=10_000_000)
    deposit_refund_days: int = Field(default=30, ge=1, le=180)
    payment_day: int = Field(default=1, ge=1, le=28)
    utilities_responsibility: str = Field(default="", max_length=1000)
    termination_terms: str = Field(default="", max_length=2000)
    extra_notes: str = Field(default="", max_length=2000)

    @field_validator("party_names")
    @classmethod
    def _parties(cls, v: dict[str, str]) -> dict[str, str]:
        for key in ("owner", "tenant"):
            name = (v.get(key) or "").strip()
            if len(name) < 3:
                raise ValueError(f"party_names.{key} must be at least 3 characters")
            v[key] = name
        return v


class ContractCreateIn(BaseModel):
    listing_id: UUID
    template: Literal["residential_unfurnished", "residential_furnished", "commercial"]
    tenant_phone: str = Field(min_length=8, max_length=20)
    national_ids: dict[str, str]  # {"owner": ..., "tenant": ...} — encrypted at rest
    terms: ContractTermsIn

    @field_validator("tenant_phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        from app.core.phone import normalize_phone

        return normalize_phone(v)

    @field_validator("national_ids")
    @classmethod
    def _nids(cls, v: dict[str, str]) -> dict[str, str]:
        for key in ("owner", "tenant"):
            nid = (v.get(key) or "").strip()
            if len(nid) < 6 or not nid.replace("-", "").isdigit():
                raise ValueError(f"national_ids.{key} must be a numeric national id")
            v[key] = nid
        return v


class ContractPatchIn(BaseModel):
    """Draft-only edits to the terms before confirmation."""

    national_ids: dict[str, str] | None = None
    terms: ContractTermsIn | None = None


class ContractPartyOut(BaseModel):
    id: str
    role: str  # owner | tenant
    full_name: str
    phone: str
    national_id_masked: str


class ContractOut(BaseModel):
    id: str
    reference_no: str
    listing_id: str
    listing_title: str | None = None
    template: str
    status: str
    terms: dict
    parties: list[ContractPartyOut]
    terms_hash: str | None = None
    owner_confirmed_at: datetime | None = None
    tenant_confirmed_at: datetime | None = None
    confirmations_log: list = Field(default_factory=list)
    fee_required: bool = False
    fee_amount: float = 0
    fee_order_id: str | None = None
    fee_order_status: str | None = None
    pdf_ready: bool = False  # generated after both confirmations
    can_edit: bool = False
    can_confirm: bool = False  # for the requesting party
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ConfirmIn(BaseModel):
    otp_code: str = Field(pattern=r"^\d{6}$")


class FeeOrderIn(BaseModel):
    method: Literal["card", "fawry", "vodafone_cash", "bank_transfer"]


class PublicVerifyOut(BaseModel):
    valid: bool
    reference_no: str | None = None
    created_at: datetime | None = None
    parties_masked: list[str] = Field(default_factory=list)
    status: str | None = None


# ── Handovers ────────────────────────────────────────────────────────────────


class HandoverItemIn(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    condition: Literal["good", "needs_repair", "damaged"] | None = None
    note: str = Field(default="", max_length=500)


class HandoverRoomIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    items: list[HandoverItemIn] = Field(default_factory=list)


class MeterIn(BaseModel):
    value: str = Field(default="", max_length=40)


class HandoverDataIn(BaseModel):
    occurred_at: date | None = None
    rooms: list[HandoverRoomIn] = Field(default_factory=list)
    meters: dict[str, MeterIn] = Field(default_factory=dict)  # electricity | water | gas
    keys_count: int | None = Field(default=None, ge=0, le=100)
    inventory: list[HandoverItemIn] = Field(default_factory=list)  # furniture/appliances
    comments: dict[str, str] = Field(default_factory=dict)  # user_id -> comment


class HandoverCreateIn(BaseModel):
    kind: Literal["check_in", "check_out"]
    source_handover_id: UUID | None = None  # check-out is created from a check-in
    data: HandoverDataIn = Field(default_factory=HandoverDataIn)


class HandoverPatchIn(BaseModel):
    data: HandoverDataIn


class HandoverMediaOut(BaseModel):
    id: str
    room: str
    media_type: str
    url: str
    note: str | None = None
    added_by: str | None = None


class HandoverOut(BaseModel):
    id: str
    contract_id: str
    contract_reference: str | None = None
    kind: str
    status: str
    data: dict
    source_handover_id: str | None = None
    hash: str | None = None
    media: list[HandoverMediaOut] = Field(default_factory=list)
    confirmations: dict = Field(default_factory=dict)
    can_edit: bool = False
    can_confirm: bool = False
    created_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

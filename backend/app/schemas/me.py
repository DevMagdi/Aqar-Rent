"""Me / devices / verification schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.phone import normalize_phone
from app.schemas.auth import UserOut


class MePatch(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    email: EmailStr | None = None
    city: str | None = Field(default=None, max_length=120)
    language: Literal["ar", "en"] | None = None


class DeviceIn(BaseModel):
    platform: Literal["android", "ios", "web"] = "web"
    push_token: str | None = Field(default=None, max_length=512)


class DeviceOut(BaseModel):
    id: str
    platform: str
    push_token: str | None = None
    last_seen_at: datetime | None = None
    created_at: datetime | None = None


class VerificationOut(BaseModel):
    id: str
    doc_type: str
    status: str
    reject_reason: str | None = None
    file_url: str | None = None
    created_at: datetime | None = None
    reviewed_at: datetime | None = None


class VerificationListOut(BaseModel):
    items: list[VerificationOut]
    user_verification_status: str


class StatsOut(BaseModel):
    view_count: int = 0
    contact_count: int = 0
    days_left: int | None = None


class MeListingOut(BaseModel):
    id: str
    title: str
    status: str
    reject_reason: str | None = None
    rent_monthly: int
    property_type: str
    governorate_id: str
    city_id: str
    district_id: str | None = None
    governorate_name: str | None = None
    city_name: str | None = None
    thumb_url: str | None = None
    stats: StatsOut = Field(default_factory=StatsOut)
    created_at: datetime | None = None
    published_at: datetime | None = None


class PhoneIn(BaseModel):
    phone: str = Field(min_length=8, max_length=20)

    @field_validator("phone")
    @classmethod
    def _v(cls, v: str) -> str:
        return normalize_phone(v)

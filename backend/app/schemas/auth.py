"""Auth (mobile OTP) schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.core.phone import normalize_phone


class OtpRequestIn(BaseModel):
    phone: str = Field(min_length=8, max_length=20)

    @field_validator("phone")
    @classmethod
    def _v(cls, v: str) -> str:
        return normalize_phone(v)


class OtpRequestOut(BaseModel):
    message: str
    expires_in: int  # seconds
    # Only populated when DEBUG=true (console provider in dev).
    dev_code: str | None = None


class OtpVerifyIn(BaseModel):
    phone: str = Field(min_length=8, max_length=20)
    code: str = Field(pattern=r"^\d{6}$")
    platform: Literal["android", "ios", "web"] = "web"
    push_token: str | None = Field(default=None, max_length=512)

    @field_validator("phone")
    @classmethod
    def _v(cls, v: str) -> str:
        return normalize_phone(v)


class RefreshIn(BaseModel):
    refresh_token: str = Field(min_length=20)


class LogoutIn(BaseModel):
    refresh_token: str | None = None


class TokenPairOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # access token lifetime seconds


class UserOut(BaseModel):
    id: str
    phone: str
    full_name: str | None = None
    email: str | None = None
    city: str | None = None
    language: str = "ar"
    status: str
    verification_status: str
    account_type: str = "individual"
    verification_level: str = "phone"
    premium_verified_until: datetime | None = None
    created_at: datetime | None = None


class AuthVerifyOut(BaseModel):
    tokens: TokenPairOut
    user: UserOut

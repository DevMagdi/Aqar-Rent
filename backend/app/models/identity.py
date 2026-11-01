"""Identity & platform tables: users, devices, otp, verification, staff, audit."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.enums import (
    DocStatus,
    StaffRole,
    StaffStatus,
    UserStatus,
    UserVerificationStatus,
)


class User(TimestampMixin, Base):
    __tablename__ = "users"

    phone: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    full_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    language: Mapped[str] = mapped_column(String(5), default="ar")
    status: Mapped[str] = mapped_column(String(20), default=UserStatus.active.value, index=True)
    verification_status: Mapped[str] = mapped_column(
        String(20), default=UserVerificationStatus.unverified.value
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Super Admin can raise the default 5-active-listing cap per user (BR-7).
    listing_cap: Mapped[int | None] = mapped_column(Integer, nullable=True)

    devices: Mapped[list[Device]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    listings: Mapped[list[Any]] = relationship(
        "Listing", back_populates="owner", lazy="selectin"
    )


class Device(TimestampMixin, Base):
    __tablename__ = "devices"

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    platform: Mapped[str] = mapped_column(String(20), default="web")  # android | ios | web
    push_token: Mapped[str | None] = mapped_column(String(512), nullable=True)
    refresh_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(back_populates="devices")


class OtpCode(TimestampMixin, Base):
    __tablename__ = "otp_codes"

    phone: Mapped[str] = mapped_column(String(20), index=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    purpose: Mapped[str] = mapped_column(String(30), default="login")


class VerificationDocument(TimestampMixin, Base):
    __tablename__ = "verification_documents"

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    file_key: Mapped[str] = mapped_column(String(512))
    doc_type: Mapped[str] = mapped_column(String(40))  # enums.DocType
    status: Mapped[str] = mapped_column(String(20), default=DocStatus.pending.value, index=True)
    reviewed_by: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("staff_users.id", ondelete="SET NULL"), nullable=True
    )
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class StaffUser(TimestampMixin, Base):
    __tablename__ = "staff_users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default=StaffRole.moderator.value)
    two_factor_secret: Mapped[str] = mapped_column(String(64), default="")
    status: Mapped[str] = mapped_column(String(20), default=StaffStatus.active.value)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuditLog(TimestampMixin, Base):
    __tablename__ = "audit_logs"

    staff_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("staff_users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(80), index=True)
    entity: Mapped[str] = mapped_column(String(60), index=True)
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    before: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)

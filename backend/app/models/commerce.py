"""Commerce tables: orders, payments, bank transfers, refunds, ad periods, promos."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, TimestampMixin


class Order(TimestampMixin, Base):
    __tablename__ = "orders"

    owner_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    listing_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("listings.id", ondelete="RESTRICT"), index=True
    )
    weeks: Mapped[int] = mapped_column(Integer)
    subtotal: Mapped[float] = mapped_column(Numeric(12, 2))
    discount: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(12, 2))
    promo_code_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("promo_codes.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    method: Mapped[str] = mapped_column(String(30))  # enums.PaymentMethod
    gateway: Mapped[str | None] = mapped_column(String(30), nullable=True)
    gateway_ref: Mapped[str | None] = mapped_column(String(120), nullable=True, unique=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Fawry pending orders expire after 48h (spec scheduled job).
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Payment(TimestampMixin, Base):
    __tablename__ = "payments"

    order_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("orders.id", ondelete="RESTRICT"), index=True
    )
    method: Mapped[str] = mapped_column(String(30))
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    # Idempotency: duplicate webhooks with the same txn id never double-apply (spec).
    gateway_txn_id: Mapped[str | None] = mapped_column(String(120), nullable=True, unique=True)
    raw_webhook: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    receipt_key: Mapped[str | None] = mapped_column(String(512), nullable=True)


class BankTransfer(TimestampMixin, Base):
    __tablename__ = "bank_transfers"

    order_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    receipt_file_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    reviewed_by: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("staff_users.id", ondelete="SET NULL"), nullable=True
    )
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class Refund(TimestampMixin, Base):
    __tablename__ = "refunds"

    payment_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("payments.id", ondelete="RESTRICT"), index=True
    )
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    reason: Mapped[str] = mapped_column(Text, default="")
    issued_by: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("staff_users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), default="completed", index=True)


class AdPeriod(TimestampMixin, Base):
    __tablename__ = "ad_periods"

    listing_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("listings.id", ondelete="CASCADE"), index=True
    )
    plan_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("plans.id", ondelete="RESTRICT"), index=True
    )
    order_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)

    __table_args__ = (Index("ix_ad_periods_ends_at_status", "ends_at", "status"),)


class PromoCode(TimestampMixin, Base):
    __tablename__ = "promo_codes"

    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    type: Mapped[str] = mapped_column(String(20))  # enums.PromoType
    value: Mapped[float] = mapped_column(Numeric(10, 2))  # percent (0-100) or free weeks
    max_uses: Mapped[int | None] = mapped_column(Integer, nullable=True)  # NULL = unlimited
    used_count: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

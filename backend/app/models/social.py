"""Social & legal tables: favorites, contact events, reports, contracts, handovers,
notifications."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, TimestampMixin


class Favorite(TimestampMixin, Base):
    __tablename__ = "favorites"

    user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    listing_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("listings.id", ondelete="CASCADE"), index=True)

    __table_args__ = (UniqueConstraint("user_id", "listing_id", name="uq_favorites_user_id_listing_id"),)


class ContactEvent(TimestampMixin, Base):
    __tablename__ = "contact_events"

    listing_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("listings.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    channel: Mapped[str] = mapped_column(String(20))  # enums.ContactChannel


class Report(TimestampMixin, Base):
    __tablename__ = "reports"

    listing_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("listings.id", ondelete="CASCADE"), index=True)
    reporter_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    reason: Mapped[str] = mapped_column(String(30))  # enums.ReportReason
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    handled_by: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("staff_users.id", ondelete="SET NULL"), nullable=True
    )


class Contract(TimestampMixin, Base):
    __tablename__ = "contracts"

    listing_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("listings.id", ondelete="RESTRICT"), index=True)
    template: Mapped[str] = mapped_column(String(60), default="standard_v1")
    owner_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    tenant_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    terms: Mapped[dict] = mapped_column(JSONType, default=dict)
    # National IDs etc. encrypted at rest (spec) — ciphertext only.
    ids_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="draft", index=True)
    reference_no: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    pdf_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    owner_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    tenant_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Phase 4: SHA-256 of the final terms once both parties confirmed (immutability).
    terms_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Append-only confirmation log: [{party, user_id, at, ip, user_agent, otp_verified}]
    confirmations_log: Mapped[list | None] = mapped_column(JSONType, nullable=True)
    # Optional contract-fee order (orders.kind = contract_fee).
    fee_order_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True
    )
    # Phase 5 — future official-registry seam. Default is honest "unavailable":
    # no Egyptian digital rental registry exists today.
    registry_status: Mapped[str] = mapped_column(String(20), default="unavailable")
    registry_ref: Mapped[str | None] = mapped_column(String(120), nullable=True)
    registry_payload: Mapped[dict | None] = mapped_column(JSONType, nullable=True)


class Handover(TimestampMixin, Base):
    __tablename__ = "handovers"

    contract_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("contracts.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(20))  # check_in | check_out
    data: Mapped[dict] = mapped_column(JSONType, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    confirmations: Mapped[dict] = mapped_column(JSONType, default=dict)
    pdf_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # Phase 4: check-out is created from a confirmed check-in (side-by-side diff).
    source_handover_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("handovers.id", ondelete="SET NULL"), nullable=True
    )
    # SHA-256 of the confirmed payload (immutability, both parties).
    hash: Mapped[str | None] = mapped_column(String(64), nullable=True)


class HandoverMedia(TimestampMixin, Base):
    __tablename__ = "handover_media"

    handover_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("handovers.id", ondelete="CASCADE"), index=True
    )
    room: Mapped[str] = mapped_column(String(60))
    file_key: Mapped[str] = mapped_column(String(512))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    media_type: Mapped[str] = mapped_column(String(10), default="photo")  # photo | video
    added_by: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


class Notification(TimestampMixin, Base):
    __tablename__ = "notifications"

    user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(50), index=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    data: Mapped[dict] = mapped_column(JSONType, default=dict)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    channel: Mapped[str] = mapped_column(String(20), default="in_app")

    __table_args__ = (Index("ix_notifications_user_read", "user_id", "read_at"),)

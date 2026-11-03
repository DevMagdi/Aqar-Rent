"""Phase 5 domain: offices/agents, CRM-lite leads, subscriptions, ad packages,
verification appeals, payment audit trail.

Design rules
------------
* The platform NEVER holds rent or deposits. `Lead.commission_egp` is a
  *record* the office keeps for its own private agreement with an owner — it is
  never invoiced, collected or settled by Aqar Rent.
* `OfficeMember` links real user accounts (each with its own OTP login) to an
  office; no shared passwords, every action is attributable.
* All new tables carry UUID PKs + created_at/updated_at (TimestampMixin) and
  portable JSON (JSONB on PostgreSQL).
"""

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
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, TimestampMixin


class OfficeProfile(TimestampMixin, Base):
    """Branded, first-class real-estate office (مكتب عقاري)."""

    __tablename__ = "office_profiles"

    owner_user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), unique=True, index=True
    )
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name_ar: Mapped[str] = mapped_column(String(160))
    name_en: Mapped[str] = mapped_column(String(160))
    description_ar: Mapped[str] = mapped_column(Text, default="")
    description_en: Mapped[str] = mapped_column(Text, default="")
    license_no: Mapped[str | None] = mapped_column(String(80), nullable=True)
    commercial_register: Mapped[str | None] = mapped_column(String(80), nullable=True)
    tax_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    public_phone: Mapped[str] = mapped_column(String(20))
    public_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    logo_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    verification_status: Mapped[str] = mapped_column(String(20), default="unverified", index=True)
    verification_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)


class OfficeMember(TimestampMixin, Base):
    """Team seat: owner / manager / agent. Invites are accepted by an OTP login."""

    __tablename__ = "office_members"

    office_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("office_profiles.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    invited_phone: Mapped[str] = mapped_column(String(20), index=True)
    display_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default="agent")
    status: Mapped[str] = mapped_column(String(20), default="invited", index=True)
    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("office_id", "invited_phone", name="uq_office_members_office_phone"),
        Index("ix_office_members_office_status", "office_id", "status"),
    )


class Lead(TimestampMixin, Base):
    """CRM-lite rental lead — the daily-driver that replaces WhatsApp + Excel."""

    __tablename__ = "leads"

    office_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("office_profiles.id", ondelete="CASCADE"), index=True
    )
    listing_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("listings.id", ondelete="SET NULL"), nullable=True, index=True
    )
    assigned_agent_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    tenant_name: Mapped[str] = mapped_column(String(120))
    tenant_phone: Mapped[str] = mapped_column(String(20), index=True)
    budget_egp: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(30), default="manual")
    stage: Mapped[str] = mapped_column(String(20), default="new", index=True)
    # Optional private office↔owner commission tracking. Never collected here.
    commission_egp: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    next_follow_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    won_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)

    __table_args__ = (Index("ix_leads_office_stage_created", "office_id", "stage", "created_at"),)


class LeadEvent(TimestampMixin, Base):
    """Append-only timeline (stage changes, calls, viewings, notes)."""

    __tablename__ = "lead_events"

    lead_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("leads.id", ondelete="CASCADE"), index=True
    )
    actor_user_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    kind: Mapped[str] = mapped_column(String(30), default="note")
    note: Mapped[str] = mapped_column(Text, default="")
    payload: Mapped[dict | None] = mapped_column(JSONType, nullable=True)


class SubscriptionPlan(TimestampMixin, Base):
    """Recurring owner / office tiers. Prices live in the DB (BR-1 spirit)."""

    __tablename__ = "subscription_plans"

    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    audience: Mapped[str] = mapped_column(String(20), index=True)  # individual | office
    name_ar: Mapped[str] = mapped_column(String(120))
    name_en: Mapped[str] = mapped_column(String(120))
    monthly_price_egp: Mapped[float] = mapped_column(Numeric(10, 2))
    listing_limit: Mapped[int] = mapped_column(Integer, default=5)
    seats: Mapped[int] = mapped_column(Integer, default=1)
    priority_weight: Mapped[int] = mapped_column(Integer, default=0)
    features: Mapped[dict] = mapped_column(JSONType, default=dict)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)


class Subscription(TimestampMixin, Base):
    """A paid month of a plan. One active subscription per (user, audience)."""

    __tablename__ = "subscriptions"

    user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    office_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("office_profiles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    plan_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("subscription_plans.id", ondelete="RESTRICT"), index=True
    )
    order_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=False)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (Index("ix_subscriptions_user_status_ends", "user_id", "status", "ends_at"),)


class AdPackage(TimestampMixin, Base):
    """Multi-week packages & priority boosts — the step above the weekly ad.

    `weeks` is converted to an ad period at settlement; `discount_pct` is
    applied to (weekly plan price × weeks). `priority_weight` raises the
    denormalized `listings.ad_priority` rank (BR-4).
    """

    __tablename__ = "ad_packages"

    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name_ar: Mapped[str] = mapped_column(String(120))
    name_en: Mapped[str] = mapped_column(String(120))
    weeks: Mapped[int] = mapped_column(Integer)
    discount_pct: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    priority_weight: Mapped[int] = mapped_column(Integer, default=0)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)


class PaymentEvent(TimestampMixin, Base):
    """Append-only audit trail for the whole payment lifecycle (ops/reconciliation).

    Never stores card data: only gateway references + a SHA-256 of the payload.
    """

    __tablename__ = "payment_events"

    order_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    event: Mapped[str] = mapped_column(String(40), index=True)
    provider: Mapped[str | None] = mapped_column(String(30), nullable=True)
    gateway_txn_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    amount: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    payload_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    detail: Mapped[str] = mapped_column(Text, default="")
    actor: Mapped[str | None] = mapped_column(String(120), nullable=True)

    __table_args__ = (Index("ix_payment_events_event_created", "event", "created_at"),)

"""Phase 5: offices/agents + CRM-lite, subscriptions & packages, trust ladder,
verification appeals, payment audit trail, registry-ready contract fields.

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-02

Backward-compatible: every new column has a server default and every old flow
(individual weekly ad) keeps working unchanged. `orders.listing_id` becomes
nullable so subscription purchases can reuse the SAME HMAC-verified,
idempotent, refundable payment pipeline instead of inventing a second one.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSONB = sa.JSON().with_variant(PG_JSONB(), "postgresql")


def upgrade() -> None:
    # ── offices ──────────────────────────────────────────────────────────────
    op.create_table(
        "office_profiles",
        sa.Column("owner_user_id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(80), nullable=False),
        sa.Column("name_ar", sa.String(160), nullable=False),
        sa.Column("name_en", sa.String(160), nullable=False),
        sa.Column("description_ar", sa.Text(), server_default="", nullable=False),
        sa.Column("description_en", sa.Text(), server_default="", nullable=False),
        sa.Column("license_no", sa.String(80), nullable=True),
        sa.Column("commercial_register", sa.String(80), nullable=True),
        sa.Column("tax_id", sa.String(80), nullable=True),
        sa.Column("public_phone", sa.String(20), nullable=False),
        sa.Column("public_email", sa.String(255), nullable=True),
        sa.Column("city", sa.String(120), nullable=True),
        sa.Column("website", sa.String(255), nullable=True),
        sa.Column("logo_key", sa.String(512), nullable=True),
        sa.Column("verification_status", sa.String(20), server_default="unverified", nullable=False),
        sa.Column("verification_note", sa.Text(), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
        sa.UniqueConstraint("owner_user_id"),
    )
    op.create_index("ix_office_profiles_owner_user_id", "office_profiles", ["owner_user_id"], unique=True)
    op.create_index("ix_office_profiles_slug", "office_profiles", ["slug"], unique=True)
    op.create_index("ix_office_profiles_verification_status", "office_profiles", ["verification_status"])
    op.create_index("ix_office_profiles_active", "office_profiles", ["active"])

    op.create_table(
        "office_members",
        sa.Column("office_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("invited_phone", sa.String(20), nullable=False),
        sa.Column("display_name", sa.String(120), nullable=True),
        sa.Column("role", sa.String(20), server_default="agent", nullable=False),
        sa.Column("status", sa.String(20), server_default="invited", nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["office_id"], ["office_profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("office_id", "invited_phone", name="uq_office_members_office_phone"),
    )
    op.create_index("ix_office_members_office_id", "office_members", ["office_id"])
    op.create_index("ix_office_members_user_id", "office_members", ["user_id"])
    op.create_index("ix_office_members_invited_phone", "office_members", ["invited_phone"])
    op.create_index("ix_office_members_status", "office_members", ["status"])
    op.create_index("ix_office_members_office_status", "office_members", ["office_id", "status"])

    op.create_table(
        "leads",
        sa.Column("office_id", sa.Uuid(), nullable=False),
        sa.Column("listing_id", sa.Uuid(), nullable=True),
        sa.Column("assigned_agent_id", sa.Uuid(), nullable=True),
        sa.Column("tenant_name", sa.String(120), nullable=False),
        sa.Column("tenant_phone", sa.String(20), nullable=False),
        sa.Column("budget_egp", sa.Integer(), nullable=True),
        sa.Column("note", sa.Text(), server_default="", nullable=False),
        sa.Column("source", sa.String(30), server_default="manual", nullable=False),
        sa.Column("stage", sa.String(20), server_default="new", nullable=False),
        sa.Column("commission_egp", sa.Numeric(12, 2), nullable=True),
        sa.Column("next_follow_up_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("won_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["office_id"], ["office_profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["listing_id"], ["listings.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["assigned_agent_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_leads_office_id", "leads", ["office_id"])
    op.create_index("ix_leads_listing_id", "leads", ["listing_id"])
    op.create_index("ix_leads_assigned_agent_id", "leads", ["assigned_agent_id"])
    op.create_index("ix_leads_tenant_phone", "leads", ["tenant_phone"])
    op.create_index("ix_leads_stage", "leads", ["stage"])
    op.create_index("ix_leads_office_stage_created", "leads", ["office_id", "stage", "created_at"])

    op.create_table(
        "lead_events",
        sa.Column("lead_id", sa.Uuid(), nullable=False),
        sa.Column("actor_user_id", sa.Uuid(), nullable=True),
        sa.Column("kind", sa.String(30), server_default="note", nullable=False),
        sa.Column("note", sa.Text(), server_default="", nullable=False),
        sa.Column("payload", JSONB, nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_lead_events_lead_id", "lead_events", ["lead_id"])

    # ── monetization ─────────────────────────────────────────────────────────
    op.create_table(
        "ad_packages",
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("name_ar", sa.String(120), nullable=False),
        sa.Column("name_en", sa.String(120), nullable=False),
        sa.Column("weeks", sa.Integer(), nullable=False),
        sa.Column("discount_pct", sa.Numeric(5, 2), server_default="0", nullable=False),
        sa.Column("priority_weight", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_featured", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index("ix_ad_packages_code", "ad_packages", ["code"], unique=True)
    op.create_index("ix_ad_packages_active", "ad_packages", ["active"])

    op.create_table(
        "subscription_plans",
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("audience", sa.String(20), nullable=False),
        sa.Column("name_ar", sa.String(120), nullable=False),
        sa.Column("name_en", sa.String(120), nullable=False),
        sa.Column("monthly_price_egp", sa.Numeric(10, 2), nullable=False),
        sa.Column("listing_limit", sa.Integer(), server_default="5", nullable=False),
        sa.Column("seats", sa.Integer(), server_default="1", nullable=False),
        sa.Column("priority_weight", sa.Integer(), server_default="0", nullable=False),
        sa.Column("features", JSONB, nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index("ix_subscription_plans_code", "subscription_plans", ["code"], unique=True)
    op.create_index("ix_subscription_plans_audience", "subscription_plans", ["audience"])
    op.create_index("ix_subscription_plans_active", "subscription_plans", ["active"])

    op.create_table(
        "subscriptions",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("office_id", sa.Uuid(), nullable=True),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=True),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("auto_renew", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["office_id"], ["office_profiles.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["plan_id"], ["subscription_plans.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_subscriptions_user_id", "subscriptions", ["user_id"])
    op.create_index("ix_subscriptions_office_id", "subscriptions", ["office_id"])
    op.create_index("ix_subscriptions_plan_id", "subscriptions", ["plan_id"])
    op.create_index("ix_subscriptions_order_id", "subscriptions", ["order_id"])
    op.create_index("ix_subscriptions_status", "subscriptions", ["status"])
    op.create_index("ix_subscriptions_user_status_ends", "subscriptions", ["user_id", "status", "ends_at"])

    op.create_table(
        "payment_events",
        sa.Column("order_id", sa.Uuid(), nullable=True),
        sa.Column("event", sa.String(40), nullable=False),
        sa.Column("provider", sa.String(30), nullable=True),
        sa.Column("gateway_txn_id", sa.String(120), nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("payload_sha256", sa.String(64), nullable=True),
        sa.Column("detail", sa.Text(), server_default="", nullable=False),
        sa.Column("actor", sa.String(120), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_payment_events_order_id", "payment_events", ["order_id"])
    op.create_index("ix_payment_events_event", "payment_events", ["event"])
    op.create_index("ix_payment_events_gateway_txn_id", "payment_events", ["gateway_txn_id"])
    op.create_index("ix_payment_events_event_created", "payment_events", ["event", "created_at"])

    # ── additive columns on existing tables ─────────────────────────────────
    op.add_column("users", sa.Column("account_type", sa.String(20), server_default="individual", nullable=False))
    op.add_column("users", sa.Column("verification_level", sa.String(20), server_default="phone", nullable=False))
    op.add_column("users", sa.Column("premium_verified_until", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_users_account_type", "users", ["account_type"])
    op.create_index("ix_users_verification_level", "users", ["verification_level"])

    op.add_column(
        "verification_documents",
        sa.Column("reject_reason_code", sa.String(40), nullable=True),
    )
    op.add_column(
        "verification_documents",
        sa.Column("appeal_status", sa.String(20), server_default="none", nullable=False),
    )
    op.add_column("verification_documents", sa.Column("appeal_note", sa.Text(), nullable=True))
    op.add_column(
        "verification_documents", sa.Column("appeal_submitted_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "verification_documents", sa.Column("appeal_reviewed_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index("ix_verification_documents_appeal_status", "verification_documents", ["appeal_status"])

    op.add_column("listings", sa.Column("office_id", sa.Uuid(), nullable=True))
    op.add_column("listings", sa.Column("agent_user_id", sa.Uuid(), nullable=True))
    with op.batch_alter_table("listings") as batch_op:
        batch_op.create_foreign_key(
            "fk_listings_office_id_office_profiles", "office_profiles", ["office_id"], ["id"], ondelete="SET NULL"
        )
        batch_op.create_foreign_key(
            "fk_listings_agent_user_id_users", "users", ["agent_user_id"], ["id"], ondelete="SET NULL"
        )
    op.create_index("ix_listings_office_id", "listings", ["office_id"])
    op.create_index("ix_listings_agent_user_id", "listings", ["agent_user_id"])

    with op.batch_alter_table("orders") as batch_op:
        batch_op.alter_column("listing_id", existing_type=sa.Uuid(), nullable=True)
        batch_op.add_column(sa.Column("subscription_plan_id", sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column("ad_package_id", sa.Uuid(), nullable=True))
        batch_op.create_foreign_key(
            "fk_orders_subscription_plan_id", "subscription_plans", ["subscription_plan_id"], ["id"], ondelete="SET NULL"
        )
        batch_op.create_foreign_key(
            "fk_orders_ad_package_id", "ad_packages", ["ad_package_id"], ["id"], ondelete="SET NULL"
        )

    # Future official registry: honest, explicit "unavailable" default.
    op.add_column(
        "contracts", sa.Column("registry_status", sa.String(20), server_default="unavailable", nullable=False)
    )
    op.add_column("contracts", sa.Column("registry_ref", sa.String(120), nullable=True))
    op.add_column("contracts", sa.Column("registry_payload", JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("contracts", "registry_payload")
    op.drop_column("contracts", "registry_ref")
    op.drop_column("contracts", "registry_status")
    with op.batch_alter_table("orders") as batch_op:
        batch_op.drop_constraint("fk_orders_ad_package_id", type_="foreignkey")
        batch_op.drop_constraint("fk_orders_subscription_plan_id", type_="foreignkey")
        batch_op.drop_column("ad_package_id")
        batch_op.drop_column("subscription_plan_id")
        batch_op.alter_column("listing_id", existing_type=sa.Uuid(), nullable=False)
    op.drop_index("ix_listings_agent_user_id", table_name="listings")
    op.drop_index("ix_listings_office_id", table_name="listings")
    with op.batch_alter_table("listings") as batch_op:
        batch_op.drop_constraint("fk_listings_agent_user_id_users", type_="foreignkey")
        batch_op.drop_constraint("fk_listings_office_id_office_profiles", type_="foreignkey")
    op.drop_column("listings", "agent_user_id")
    op.drop_column("listings", "office_id")
    op.drop_index("ix_verification_documents_appeal_status", table_name="verification_documents")
    for col in (
        "appeal_reviewed_at", "appeal_submitted_at", "appeal_note", "appeal_status", "reject_reason_code"
    ):
        op.drop_column("verification_documents", col)
    op.drop_index("ix_users_verification_level", table_name="users")
    op.drop_index("ix_users_account_type", table_name="users")
    op.drop_column("users", "premium_verified_until")
    op.drop_column("users", "verification_level")
    op.drop_column("users", "account_type")
    op.drop_table("payment_events")
    op.drop_table("subscriptions")
    op.drop_table("subscription_plans")
    op.drop_table("ad_packages")
    op.drop_table("lead_events")
    op.drop_table("leads")
    op.drop_table("office_members")
    op.drop_table("office_profiles")

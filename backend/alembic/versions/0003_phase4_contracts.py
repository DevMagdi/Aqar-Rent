"""Phase 4: contract confirmation/immutability, fee orders, handover extras.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-02
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # orders.kind: ad_period (default) vs contract_fee (Phase-4 optional fee)
    op.add_column(
        "orders", sa.Column("kind", sa.String(length=20), nullable=False, server_default="ad_period")
    )
    op.create_index("ix_orders_kind", "orders", ["kind"])

    # contracts: immutability hash + append-only confirmation log + fee order
    op.add_column("contracts", sa.Column("terms_hash", sa.String(length=64), nullable=True))
    op.add_column("contracts", sa.Column("confirmations_log", sa.JSON(), nullable=True))
    op.add_column("contracts", sa.Column("fee_order_id", sa.Uuid(), nullable=True))
    if op.get_bind().dialect.name == "postgresql":
        op.create_foreign_key(
            "fk_contracts_fee_order_id", "contracts", "orders", ["fee_order_id"], ["id"], ondelete="SET NULL"
        )

    # handovers: check-out source + content hash
    op.add_column("handovers", sa.Column("source_handover_id", sa.Uuid(), nullable=True))
    op.add_column("handovers", sa.Column("hash", sa.String(length=64), nullable=True))
    if op.get_bind().dialect.name == "postgresql":
        op.create_foreign_key(
            "fk_handovers_source_handover_id",
            "handovers",
            "handovers",
            ["source_handover_id"],
            ["id"],
            ondelete="SET NULL",
        )

    # handover_media: photo/video + attribution
    op.add_column(
        "handover_media",
        sa.Column("media_type", sa.String(length=10), nullable=False, server_default="photo"),
    )
    op.add_column("handover_media", sa.Column("added_by", sa.Uuid(), nullable=True))
    if op.get_bind().dialect.name == "postgresql":
        op.create_foreign_key(
            "fk_handover_media_added_by", "handover_media", "users", ["added_by"], ["id"], ondelete="SET NULL"
        )


def downgrade() -> None:
    op.drop_column("handover_media", "added_by")
    op.drop_column("handover_media", "media_type")
    op.drop_column("handovers", "hash")
    op.drop_column("handovers", "source_handover_id")
    op.drop_column("contracts", "fee_order_id")
    op.drop_column("contracts", "confirmations_log")
    op.drop_column("contracts", "terms_hash")
    op.drop_index("ix_orders_kind", table_name="orders")
    op.drop_column("orders", "kind")

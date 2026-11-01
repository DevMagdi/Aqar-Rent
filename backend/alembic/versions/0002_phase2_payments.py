"""Phase 2 payments: orders.plan_id (BR-1) + refunds.gateway_ref.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-02
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("plan_id", sa.Uuid(), nullable=True))
    op.create_index("ix_orders_plan_id", "orders", ["plan_id"])
    if op.get_bind().dialect.name == "postgresql":
        # SQLite cannot ADD CONSTRAINT without a table rebuild; create_all in
        # tests already provides the FK there. PostgreSQL gets the real FK.
        op.create_foreign_key(
            "fk_orders_plan_id", "orders", "plans", ["plan_id"], ["id"], ondelete="SET NULL"
        )
    op.add_column("refunds", sa.Column("gateway_ref", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("refunds", "gateway_ref")
    if op.get_bind().dialect.name == "postgresql":
        op.drop_constraint("fk_orders_plan_id", "orders", type_="foreignkey")
    op.drop_index("ix_orders_plan_id", table_name="orders")
    op.drop_column("orders", "plan_id")

"""Composite (status, sort-key) indexes for price/area search sorts.

SQLite prefers the status index + a full temp sort over a standalone
rent_monthly index (it cannot early-exit), so price_asc took ~500ms at 100k
listings. With (status, rent_monthly) the ORDER BY is served by the index
and the correlated EXISTS early-exits after `limit` matches.

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-02
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("ix_listings_status_rent_monthly", "listings", ["status", "rent_monthly"])
    op.create_index("ix_listings_status_area_m2", "listings", ["status", "area_m2"])


def downgrade() -> None:
    op.drop_index("ix_listings_status_area_m2", table_name="listings")
    op.drop_index("ix_listings_status_rent_monthly", table_name="listings")

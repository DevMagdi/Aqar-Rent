"""Search performance indexes (Phase 4C load-test findings).

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-02
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # price/area sorts + status+time scans used by the public search
    op.create_index("ix_listings_rent_monthly", "listings", ["rent_monthly"])
    op.create_index("ix_listings_area_m2", "listings", ["area_m2"])
    op.create_index("ix_listings_status_created_at", "listings", ["status", "created_at"])
    # ad-window lookups (exists + rank join)
    op.create_index("ix_ad_periods_listing_status", "ad_periods", ["listing_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_ad_periods_listing_status", table_name="ad_periods")
    op.drop_index("ix_listings_status_created_at", table_name="listings")
    op.drop_index("ix_listings_area_m2", table_name="listings")
    op.drop_index("ix_listings_rent_monthly", table_name="listings")

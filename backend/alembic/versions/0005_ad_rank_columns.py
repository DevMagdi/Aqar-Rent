"""Denormalized ad rank for the 'newest' search sort (Phase 4C load test).

The previous ORDER BY used two correlated scalar subqueries evaluated per
candidate row (and a grouped join materialized ~100k rows per request) — both
blew past the p95<600ms target at 100k listings. We now store
`ad_priority`/`ad_starts_at` on the listing, maintained whenever an ad period
starts or ends, and sort on an index instead.

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-02
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("listings")}

    # idempotent: SQLite DDL is non-transactional — a killed run can leave
    # columns behind without the alembic stamp.
    if "ad_priority" not in cols:
        op.add_column("listings", sa.Column("ad_priority", sa.Float(), nullable=False, server_default="0"))
    if "ad_starts_at" not in cols:
        op.add_column("listings", sa.Column("ad_starts_at", sa.DateTime(timezone=True), nullable=True))

    # One-time backfill in Python: single GROUP BY passes + batched UPDATEs.
    # Correlated subqueries in SQL took >10 min at 100k listings (SQLite
    # re-evaluates them per row); a JOIN variant materialized ad_periods×plans
    # per row. This is O(n) with bounded memory.
    starts: dict = {}
    for lid, mx in bind.execute(
        sa.text(
            "SELECT listing_id, MAX(starts_at) FROM ad_periods "
            "WHERE status = 'active' GROUP BY listing_id"
        )
    ):
        starts[str(lid)] = mx
    priorities: dict = {}
    for lid, prio in bind.execute(
        sa.text(
            "SELECT ad.listing_id, plans.priority_weight FROM ad_periods ad "
            "JOIN plans ON plans.id = ad.plan_id WHERE ad.status = 'active'"
        )
    ):
        key = str(lid)
        priorities[key] = max(priorities.get(key, 0), float(prio or 0))
    keys = set(starts) | set(priorities)
    if keys:
        bind.execute(
            sa.text("UPDATE listings SET ad_starts_at = :s, ad_priority = :p WHERE id = :id"),
            [{"s": starts.get(k), "p": priorities.get(k, 0.0), "id": k} for k in keys],
        )

    existing = {ix["name"] for ix in inspector.get_indexes("listings")}
    if "ix_listings_active_rank" not in existing:
        op.create_index("ix_listings_active_rank", "listings", ["status", "ad_priority", "ad_starts_at", "id"])
    # a covering window index here made the correlated EXISTS O(n²) — drop it
    op.execute("DROP INDEX IF EXISTS ix_ad_periods_window")


def downgrade() -> None:
    op.drop_index("ix_listings_active_rank", table_name="listings")
    op.drop_column("listings", "ad_starts_at")
    op.drop_column("listings", "ad_priority")

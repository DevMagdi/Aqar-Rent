"""The hand-written Alembic migration must build the full schema from scratch."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]


def test_alembic_upgrade_head_builds_all_tables(tmp_path):
    db_path = tmp_path / "migrated.db"
    url = f"sqlite:///{db_path}"
    env = {**os.environ, "DATABASE_URL": url}
    proc = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert proc.returncode == 0, proc.stderr

    import sqlite3

    conn = sqlite3.connect(db_path)
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    expected = {
        "users",
        "devices",
        "otp_codes",
        "verification_documents",
        "locations",
        "listings",
        "listing_media",
        "plans",
        "orders",
        "payments",
        "bank_transfers",
        "refunds",
        "ad_periods",
        "promo_codes",
        "favorites",
        "contact_events",
        "reports",
        "contracts",
        "handovers",
        "handover_media",
        "notifications",
        "staff_users",
        "audit_logs",
        "office_profiles",
        "office_members",
        "leads",
        "lead_events",
        "subscription_plans",
        "subscriptions",
        "ad_packages",
        "payment_events",
    }
    assert expected <= tables, expected - tables

    indexes = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='index'")}
    assert "ix_ad_periods_ends_at_status" in indexes
    assert any("favorites" in i for i in indexes)
    conn.close()


def test_migration_is_versioned(tmp_path):
    import sqlite3

    db_path = tmp_path / "v.db"
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{db_path}"}
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        timeout=120,
    )
    conn = sqlite3.connect(db_path)
    versions = [r[0] for r in conn.execute("SELECT version_num FROM alembic_version")]
    # Head advanced with Phase 5 (0007: offices, subscriptions, trust ladder).
    assert versions == ["0007"]
    cols = {
        r[1]
        for r in conn.execute("PRAGMA table_info(orders)")
    }
    assert {"kind", "subscription_plan_id", "ad_package_id"} <= cols
    user_cols = {r[1] for r in conn.execute("PRAGMA table_info(users)")}
    assert {"account_type", "verification_level"} <= user_cols
    doc_cols = {r[1] for r in conn.execute("PRAGMA table_info(verification_documents)")}
    assert {"reject_reason_code", "appeal_status", "appeal_note"} <= doc_cols
    contract_cols_2 = {r[1] for r in conn.execute("PRAGMA table_info(contracts)")}
    assert {"registry_status", "registry_ref"} <= contract_cols_2
    assert "kind" in cols
    contract_cols = {r[1] for r in conn.execute("PRAGMA table_info(contracts)")}
    assert {"terms_hash", "confirmations_log", "fee_order_id"} <= contract_cols
    handover_cols = {r[1] for r in conn.execute("PRAGMA table_info(handovers)")}
    assert {"source_handover_id", "hash"} <= handover_cols
    # Phase-4C search indexes + denormalized ad-rank columns
    indexes = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='index'")}
    assert "ix_listings_rent_monthly" in indexes
    assert "ix_listings_area_m2" in indexes
    assert "ix_listings_active_rank" in indexes
    assert "ix_listings_status_rent_monthly" in indexes
    listing_cols = {r[1] for r in conn.execute("PRAGMA table_info(listings)")}
    assert {"ad_priority", "ad_starts_at"} <= listing_cols
    conn.close()

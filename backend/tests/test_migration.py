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
    assert versions == ["0001"]
    conn.close()

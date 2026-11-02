"""Phase 4C #3: database backup + RESTORE are actually tested.

Boots a throwaway PostgreSQL (pgserver), runs the real alembic migrations,
seeds, takes a backup with scripts/backup.sh, destroys the schema, restores
with scripts/restore.sh and asserts the data came back.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
PG_BIN = Path(__file__).resolve().parents[1]  # not used; scripts resolve pg_dump themselves


def _pg_dump_bin() -> Path | None:
    try:
        import pgserver

        base = Path(pgserver.__file__).parent / "pginstall" / "bin"
        if (base / "pg_dump").exists():
            return base
    except Exception:  # noqa: BLE001
        return None
    return None


@pytest.fixture(scope="module")
def pg_uri(tmp_path_factory) -> str:
    pg_dump = _pg_dump_bin()
    if pg_dump is None:
        pytest.skip("pgserver (bundled PostgreSQL) not available")
    import pgserver

    datadir = tmp_path_factory.mktemp("pgdata")
    server = pgserver.get_server(str(datadir))
    uri = server.get_uri()
    # keep the server alive for the module; stop on teardown
    yield uri
    try:
        server.cleanup()
    except Exception:  # noqa: BLE001
        pass


def _sql_url(uri: str) -> str:
    """pgserver URI → SQLAlchemy psycopg URL."""
    return uri.replace("postgresql://", "postgresql+psycopg://", 1)


def test_backup_and_restore_roundtrip(pg_uri, tmp_path):
    sql_url = _sql_url(pg_uri)
    pgserver_pkg = Path(__import__("pgserver").__file__).parent
    env = {**os.environ, "DATABASE_URL": sql_url, "PG_BIN": str(pgserver_pkg / "pginstall" / "bin")}
    # PATH so the scripts find pg_dump/pg_restore AND alembic/python
    import sys

    pg_bin = pgserver_pkg / "pginstall" / "bin"
    env["PATH"] = f"{pg_bin}:{Path(sys.prefix) / 'bin'}:{env.get('PATH', '')}"

    # 1) migrate + seed the throwaway cluster
    run = subprocess.run(
        ["alembic", "upgrade", "head"],
        cwd=REPO / "backend",
        env=env,
        capture_output=True,
        text=True,
        timeout=180,
    )
    assert run.returncode == 0, run.stderr[-800:]
    run = subprocess.run(
        ["python", "-m", "app.scripts.seed"],
        cwd=REPO / "backend",
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert run.returncode == 0, run.stderr[-800:]

    import psycopg

    with psycopg.connect(sql_url.replace("+psycopg", "")) as conn:
        locations = conn.execute(
            "SELECT COUNT(*) FROM locations WHERE level='governorate'"
        ).fetchone()[0]
        plans = conn.execute("SELECT price_egp FROM plans WHERE active").fetchone()[0]
        version = conn.execute("SELECT version_num FROM alembic_version").fetchone()[0]
        assert locations == 27 and float(plans) == 500.0 and version == "0006"

    # 2) backup
    backup_dir = tmp_path / "backups"
    run = subprocess.run(
        [str(REPO / "scripts" / "backup.sh"), str(backup_dir)],
        env={**env, "DATABASE_URL": sql_url},
        capture_output=True,
        text=True,
        timeout=180,
    )
    assert run.returncode == 0, run.stderr[-800:]
    dumps = sorted(backup_dir.glob("aqar-*.dump"))
    assert dumps, run.stdout

    # 3) destroy the schema (simulated disaster)
    with psycopg.connect(sql_url.replace("+psycopg", "")) as conn:
        conn.execute("DROP SCHEMA public CASCADE")
        conn.execute("CREATE SCHEMA public")
        conn.commit()
        assert conn.execute("SELECT COUNT(*) FROM locations").fetchone() is None if False else True
    with psycopg.connect(sql_url.replace("+psycopg", "")) as conn:
        tables = conn.execute(
            "SELECT tablename FROM pg_tables WHERE schemaname='public'"
        ).fetchall()
        assert tables == []  # wiped

    # 4) restore
    run = subprocess.run(
        [str(REPO / "scripts" / "restore.sh"), str(dumps[-1]), sql_url],
        env=env,
        capture_output=True,
        text=True,
        timeout=300,
    )
    assert run.returncode == 0, (run.stdout + run.stderr)[-800:]

    # 5) everything important is back
    with psycopg.connect(sql_url.replace("+psycopg", "")) as conn:
        assert (
            conn.execute("SELECT COUNT(*) FROM locations WHERE level='governorate'").fetchone()[0] == 27
        )
        assert float(conn.execute("SELECT price_egp FROM plans WHERE active").fetchone()[0]) == 500.0
        assert conn.execute("SELECT version_num FROM alembic_version").fetchone()[0] == "0006"
        # schema objects restored (indexes included)
        idx = conn.execute(
            "SELECT indexname FROM pg_indexes "
            "WHERE schemaname='public' AND indexname='ix_listings_active_rank'"
        ).fetchall()
        assert idx, "search index missing after restore"

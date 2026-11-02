#!/usr/bin/env bash
# Database backup (Phase 4C #3): pg_dump custom format → backups/ (or $BACKUP_DIR).
# Usage: DATABASE_URL=postgresql+psycopg://… ./scripts/backup.sh [output-dir]
set -euo pipefail

DB_URL="${DATABASE_URL:?set DATABASE_URL}"
OUT_DIR="${1:-${BACKUP_DIR:-backups}}"
mkdir -p "$OUT_DIR"

# SQLAlchemy driver suffix (postgresql+psycopg) is not a libpq URI
PG_URL="$(printf '%s' "$DB_URL" | sed -E 's/\+psycopg[a-z]*//')"

if command -v pg_dump >/dev/null 2>&1; then
  PGDUMP=pg_dump
elif [ -n "${PG_BIN:-}" ] && [ -x "${PG_BIN}/pg_dump" ]; then
  PGDUMP="${PG_BIN}/pg_dump"
else
  echo "pg_dump not found (install postgresql-client or set PG_BIN)" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${OUT_DIR}/aqar-${STAMP}.dump"
"$PGDUMP" --format=custom --no-owner --file "$OUT" "$PG_URL"
echo "backup written: $OUT ($(du -h "$OUT" | cut -f1))"

# keep the last 14 backups
ls -1t "${OUT_DIR}"/aqar-*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f

#!/usr/bin/env bash
# Restore a backup produced by backup.sh into a target database.
# Usage: ./scripts/restore.sh <dump-file> [target-database-url]
#   target defaults to $DATABASE_URL. The target schema is dropped first
#   (--clean --if-exists), so this is deliberately destructive: run it only
#   against the database you mean to overwrite.
set -euo pipefail

DUMP="${1:?usage: restore.sh <dump-file> [target-url]}"
[ -f "$DUMP" ] || { echo "dump not found: $DUMP" >&2; exit 1; }
DB_URL="${2:-${DATABASE_URL:?set DATABASE_URL or pass a target url}}"

# SQLAlchemy driver suffix (postgresql+psycopg…) is not a libpq URI
PG_URL="$(printf '%s' "$DB_URL" | sed -E 's/\+psycopg[a-z]*//')"

if command -v pg_restore >/dev/null 2>&1; then
  PGRESTORE=pg_restore
elif [ -n "${PG_BIN:-}" ] && [ -x "${PG_BIN}/pg_restore" ]; then
  PGRESTORE="${PG_BIN}/pg_restore"
else
  echo "pg_restore not found (install postgresql-client or set PG_BIN)" >&2
  exit 1
fi

"$PGRESTORE" --clean --if-exists --no-owner --dbname "$PG_URL" "$DUMP"
echo "restored: $DUMP → ${DB_URL%%@*}@…"

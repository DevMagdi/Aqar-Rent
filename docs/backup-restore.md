# Database backup & restore (Phase 4C #3)

## Backup

```bash
DATABASE_URL=postgresql+psycopg://… ./scripts/backup.sh [output-dir]
# → backups/aqar-YYYYMMDD-HHMMSS.dump  (pg_dump custom format, last 14 kept)
```

Cron (daily, off-peak):

```
0 3 * * * cd /srv/aqar-rent && DATABASE_URL=… ./scripts/backup.sh /var/backups/aqar
```

## Restore (destructive — overwrites the target schema)

```bash
./scripts/restore.sh backups/aqar-….dump [target-database-url]
# target defaults to $DATABASE_URL; runs pg_restore --clean --if-exists --no-owner
```

Post-restore checklist: `GET /ready` 200, `SELECT version_num FROM
alembic_version` matches head, login + search smoke test.

## It is actually tested

`backend/tests/test_backup_restore.py` boots a throwaway PostgreSQL
(pgserver), migrates + seeds, takes a **real backup with backup.sh**, drops the
schema, **restores with restore.sh** and asserts rows, plan price, migration
version and the search index all came back. The test runs in CI (it skips only
if the bundled PostgreSQL is unavailable).

## Notes

- Object storage (media/PDFs) is NOT in the DB dump: replicate the MinIO/S3
  bucket with `mc mirror` (same schedule) — media is served from storage.
- `pg_dump` comes from `postgresql-client` or the bundled `PG_BIN`
  (pgserver) — the scripts auto-detect both.

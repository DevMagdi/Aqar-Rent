# Deployment, environments, migrations, rollback (Phase 4C #5)

## Environments

| | dev | staging | production |
|---|---|---|---|
| compose | `docker-compose.yml` | `docker-compose.staging.yml` | same as staging, separate host |
| env file | `.env` | `.env.staging` (from `.env.staging.example`) | `.env` on the host (never in git) |
| `APP_ENV` | dev | staging | **prod** (enables CSP, refuses weak admin secrets) |
| payments | MockProvider | mock until Paymob verified | **Paymob live keys** |
| DB | SQLite (optional) | PostgreSQL+PostGIS | PostgreSQL+PostGIS |

Secrets: only env files / orchestrator secrets — nothing in the repo
(`.env`, `.env.staging`, `backups/` are gitignored). Rotation notes for
`CONTRACT_NID_KEY` are in `app/core/crypto_service.py`.

## Build & run (staging)

```bash
cp .env.staging.example .env.staging   # fill secrets
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d --build
# migrations run in the api command (alembic upgrade head) — idempotent
```

Images: API/worker build from `backend/Dockerfile`, web from `web/Dockerfile`
(multi-stage `next build` → `next start`), admin from `admin/Dockerfile`
(Vite build → nginx with `/api` proxy + SPA fallback).

## CI/CD (`.github/workflows/`)

- `ci.yml`: **pip-audit**, ruff, mypy, pytest ×{SQLite, PostgreSQL+PostGIS},
  web (npm audit + tsc + vitest + `next build`), admin (npm audit + tsc +
  build), **Playwright e2e** (10 tests in 8 specs, incl. design-system compliance).
- `deploy-staging.yml`: on push to `main` → build+push api/web/admin images
  to GHCR → SSH deploy when `STAGING_HOST` is set (needs
  `STAGING_SSH_KEY` secret + `.env.staging` on the host). Without those
  secrets it still runs the image builds as a deploy-readiness gate.

## Migration strategy

- Alembic, forward-only in deploy (`alembic upgrade head` runs in the api
  container command before serving).
- Migrations are additive first (new columns nullable/defaulted — see
  `0003…0007`); destructive steps go in a later release after the previous
  version has run for a full day.
- `alembic downgrade` exists per revision for emergencies; SQLite DDL is
  non-transactional (migrations are written idempotently — `0005` shows the
  pattern).

## Rollback

1. Redeploy the previous image tag (`type=sha` tags are kept per commit):
   `docker compose … up -d --no-build api` with the previous image.
2. Schema: **do not auto-downgrade**. Additive columns are harmless to the old
   code (it ignores them). For a bad destructive migration restore the backup
   (docs/backup-restore.md) instead.
3. Payments incidents: set `PAYMENT_PROVIDER=mock` only in dev — in prod,
   disable checkout by feature-flag/env rather than downgrading.

## CDN for media

Public listing media is served through the app (`/api/v1/files/public/…`) so
the signed-URL rules stay enforced. Put a CDN/edge cache **only** in front of
that public path (Cache-Control is immutable per key — media content never
changes under a key). Private documents (verification, receipts, contract
PDFs, handover media) stay on short-lived signed URLs — **never** CDN-cached.

---

## Phase 5 deployment notes

- `ENVIRONMENT=production` is accepted as an alias for `APP_ENV=prod` (also
  `staging`, `development`, `test`). Keep `APP_ENV` if existing tooling uses it.
- `Settings.validate_runtime()` additionally requires
  `PAYMENT_PROVIDER=paymob`, `OTP_PROVIDER=twilio`, a non-empty
  `WEBHOOK_IP_ALLOWLIST`, `BANK_ACCOUNT_NUMBER` and `REGISTRY_ADAPTER=none` in
  production; staging requires Twilio. Weak secrets/SQLite/DEBUG/wildcard CORS
  remain refused.
- `alembic upgrade head` now applies `0007`. Rehearse it on a PostgreSQL staging
  clone before production (SQLite path is covered by `test_migration.py`).
- `python -m app.services.seed_service` additionally seeds 3 ad packages and 4
  subscription plans idempotently; admin price changes are NOT overwritten.
- New limits: `VERIFICATION_UPLOAD_RATE_LIMIT_PER_HOUR`,
  `LEAD_RATE_LIMIT_PER_HOUR`, `OFFICE_INVITE_RATE_LIMIT_PER_HOUR`,
  `SUBSCRIPTION_RATE_LIMIT_PER_HOUR`.
- Mobile release: `scripts/mobile-build.sh` + `.github/workflows/mobile.yml`;
  `scripts/generate-app-links.sh` writes verified association files with real
  signing data. Never commit Firebase plist/json, keystores or `key.properties`.

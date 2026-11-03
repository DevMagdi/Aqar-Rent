# Production go-live checklist — عقار رينت

Run this in order. Every item is either a command, a config gate or an external
sign-off. **Do not launch while any ⛔ blocker is open.**

## 0. Code quality gates (CI) — **all green on PR #7**

Verified by GitHub Actions runs `41494237189` (ci.yml) and `41494237192`
(mobile.yml); local battery reproduced before the merge.

- [x] `cd backend && .venv/bin/python -m pytest -q` → 162 passed with `pgserver` (161 + 1 skip without it)
- [x] `.venv/bin/python -m ruff check app tests` + `ruff check .` → clean
- [x] `.venv/bin/python -m mypy app` → clean (97 files)
- [x] `cd web && npx tsc --noEmit && npm test && npm run build` → 21 vitest + production build
- [x] `cd admin && npx tsc --noEmit && npm run build`
- [x] `cd backend && .venv/bin/python ../scripts/generate-api-docs.py` → no diff (113 paths / 137 requests)
- [x] `.github/workflows/mobile.yml` → `flutter analyze --fatal-infos`: **No issues found**, `flutter test --coverage`: **5/5 passed**
- [x] `e2e` job → 10 Playwright tests in 8 specs passed (incl. Mantiq computed-style/WCAG checks)
- [ ] `flutter test integration_test/` on a real device/emulator (requires SDK + device; release-dispatch gate)

## 1. Database & migrations

- [ ] Provision PostgreSQL 16 + PostGIS; `DATABASE_URL=postgresql+psycopg://…`
- [x] `alembic upgrade head` → `0007` on **both** SQLite (`test_migration.py`)
      and PostgreSQL 16 + PostGIS (CI `test (postgres)` job); backup/restore
      drill passes in `test_backup_restore.py`. Still run once on a staging clone
      with production-shaped data before go-live.
- [ ] `python -m app.services.seed_service` → 27 governorates, default weekly
      plan 500 EGP/7 days, 3 ad packages, 4 subscription plans, Super Admin
- [ ] Verify `/pricing` and `/admin/growth/subscription-plans` show the same data
- [ ] Backup + restore drill (`docs/backup-restore.md`, `scripts/restore.sh`)

## 2. Secrets & production boot validation

- [ ] `ENVIRONMENT=production` (alias → `app_env=prod`) **or** `APP_ENV=prod`
- [ ] `PAYMENT_PROVIDER=paymob`, `PAYMOB_API_KEY`, `PAYMOB_HMAC_SECRET`,
      integration IDs for card / wallet / Fawry
- [ ] `WEBHOOK_IP_ALLOWLIST` = Paymob callback CIDRs **⛔ live keys**
- [ ] `OTP_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
      `TWILIO_FROM_NUMBER` (E.164 / approved Egyptian sender) **⛔ live account**
- [ ] `BANK_ACCOUNT_NUMBER`, `BANK_NAME` for the manual transfer path
- [ ] `SECRET_KEY` ≥ 32 random bytes, `CONTRACT_NID_KEY` base64 32 bytes,
      `STAFF_SUPER_ADMIN_PASSWORD` + TOTP, explicit `CORS_ORIGINS`, `SITE_URL=https://…`
- [ ] `STORAGE_BACKEND=s3` with separate public media / private documents buckets
- [ ] `REGISTRY_ADAPTER=none` (enforced — no official Egyptian registry exists)
- [ ] Boot once with a deliberately bad value and confirm `SystemExit` lists the problem
- [ ] Confirm no `mock://` or console OTP reachable; `/metrics` shows
      `aqar_webhook_failures_total` / `aqar_payment_failures_total`

## 3. Payments & reconciliation

- [ ] Real 1-EGP capture via card, Vodafone Cash and Fawry; verify webhook success
- [ ] Replay the same webhook → `duplicate`, no second activation/subscription
- [ ] Invalid HMAC → 401 + `webhook.invalid_signature` event
- [ ] Amount mismatch → ignored + `webhook.amount_mismatch` event
- [ ] Full + partial refund; ad period or subscription shorter/cancelled correctly
- [ ] Bank transfer: upload receipt → Finance approve → activate; reject path
- [ ] `/admin/growth/reconciliation` → `consistent: true`, mismatches empty
- [ ] Arabic PDF receipt for ad AND subscription orders

## 4. Legal ⛔ lawyer sign-off

- [ ] Written opinion from an Egyptian lawyer on the 3 templates, Terms &
      Privacy and marketing copy (`docs/legal-notes.md` §3)
- [ ] Confirm no "registered / notarised / official / executive instrument" claim
- [ ] Confirm `/verify/{ref}` reveals no names or national IDs
- [ ] `GET /contracts/{id}/registry-status` → `unavailable` with honest copy
- [ ] PDPL data-retention review (docs 90 days, contact events 12 months)
- [ ] Store privacy labels / Data Safety reviewed

## 5. Web, admin, mobile release

- [ ] Web static pages complete in AR/EN (no "coming soon"), pricing + office pages live
- [ ] Admin nav: plans/packages, offices, appeals, reconciliation; role gates tested
- [ ] `scripts/generate-app-links.sh` with real Play SHA-256 + Apple Team ID;
      serve both association files over HTTPS
- [ ] Mobile `ENVIRONMENT=production`, HTTPS `API_BASE`, production `MAP_TILES_URL`,
      all `FIREBASE_*` defines; release build fails fast if any is missing
- [ ] `scripts/mobile-build.sh` → signed APK + AAB + IPA; store uploads
- [ ] FCM: real token registered at `/me/devices`, foreground notification + tap route
- [ ] Deep links verified on both platforms (`aqarrent://listing/<id>`, `https://aqarrent.app/...`)
- [ ] Screenshots + demo video captured per `mobile/docs/demo-script.md`

## 6. Observability, security & operations

- [ ] `/health`, `/ready`, `/metrics`, structured redacting logs, Sentry DSN
- [ ] OWASP checklist (`docs/security/owasp-checklist.md`) + threat model updated
- [ ] Rate limits: OTP, contact, uploads, leads, invites, subscription orders
- [ ] Hourly jobs (expiry, notification sweep, PDF pre-warm) monitored
- [ ] Runbook + on-call alerting for webhook/payment failure counters
- [ ] Load test against staging (`docs/load-test/report.md`)

## 7. Business readiness

- [ ] Office verification queue staffed (commercial register review)
- [ ] Rejection reasons + appeal SLA documented for moderators
- [ ] Support inbox staffed; moderation SLA 24h
- [ ] Pricing published on web + mobile + store description
- [ ] Optional office↔owner commission clarified as a private arrangement

## Final gate

⛔ **Not cleared for public launch** until X1–X10 in
`docs/external-dependencies.md` are closed. The code is release-ready; the
remaining items are credentials, legal sign-off, store accounts and hardware.

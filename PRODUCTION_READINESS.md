# PRODUCTION_READINESS.md — Aqar Rent

Honest pass/fail evidence for every hard requirement. Generated after the
full verification battery on **2026-11-02**; re-run the commands to refresh.

**Verdict: READY FOR STAGING / PILOT. NOT yet cleared for public launch** —
four external blockers (Paymob live keys, Twilio credentials, lawyer review,
Flutter build verification) must be closed first; they are configuration/legal
items, not code gaps.

Legend: ✅ pass with evidence · ⚠️ pass with caveat · ❌ blocked (external dependency)

---

## A. Documentation & truthfulness

| # | Item | Status | Evidence |
|---|---|---|---|
| A1 | README matches reality | ✅ | README “Status” lists phases1–4 with exact test counts (see G); roadmap marks only genuinely unfinished items |
| A2 | ASSUMPTIONS in sync | ✅ | items1–77 incl. Phase-4 decisions (templates, OTP confirm, NIDs, fee order kind, search perf, mini-Flutter scope) |
| A3 | This document | ✅ | you are reading it |
| A4 | No stale “planned/done” claims | ✅ | README rewritten this round; Phase-3B described as built-for-real below with its verification caveat |

## B. Backend / infrastructure

| # | Item | Status | Evidence |
|---|---|---|---|
| B5 | PostgreSQL+PostGIS enforced outside tests; SQLite refused in staging/prod | ✅ | `Settings.validate_runtime()` raises `SystemExit` listing every problem at boot; tests `test_production_config.py` (11) |
| B6 | Redis rate limiting | ✅ | sliding-window ZSET in `app/core/rate_limit.py`, shared across workers; in-process fallback for dev/test (unit-tested, incl. quota unlink on reject) |
| B7 | Real SMS provider; console dev-only | ✅ code / ❌ creds | `TwilioOTPProvider` (E.164, basic-auth REST, errors never leak the code); boot refuses `OTP_PROVIDER=console` in staging/prod. **Blocked on Twilio account credentials** |
| B8 | Real object storage | ✅ | S3/MinIO driver (`STORAGE_BACKEND=s3`), public media bucket + private documents bucket, signed short-lived URLs for all private files; prod refuses local storage |
| B9 | Production compose | ✅ | `docker-compose.staging.yml`: `${VAR:?}` required secrets, app-level boot validation, healthchecks (db/redis/minio/api `/ready`/web/admin), `restart: unless-stopped`, json-file log rotation (10m×3), mem/cpu limits |
| B10 | Worker reliable + monitored | ✅ | arq hourly jobs with per-job try/except + `aqar_job_failures_total` / `aqar_job_last_run_*` metrics; one failure never stops the rest |
| B11 | Structured logging + metrics | ✅ | redacting formatter (`[PHONE]/[NID]/[TOKEN]`) + `GET /metrics` (Prometheus: latency histogram, webhook/payment/job counters) |
| B12 | Load-test evidence | ✅ | `docs/load-test/report.md`: Locust20 users/60s on **100k listings** + checkout bench — search p95: newest **23 ms**, sequential worst variant **17 ms** (target<600 ✅), checkout create p95 **232 ms**,0 failures |

## C. Payments (must be live)

| # | Item | Status | Evidence |
|---|---|---|---|
| C13 | Paymob card + Vodafone Cash + Fawry wired & tested | ✅ code / ❌ live keys | `app/services/payments/paymob.py` (auth token, order, iframe/kiosk, HMAC-SHA51230-field verify, refund) + unit tests `test_paymob_provider.py`; boot refuses `PAYMENT_PROVIDER=mock` in prod. **Blocked on Paymob live credentials (go-live)** |
| C14 | Webhook HMAC + IP allowlist + idempotency | ✅ | `webhook_ip_allowlist` setting, HMAC verify, unique `gateway_txn_id` + row lock; tests: bad-signature, duplicate & replay never double-activate |
| C15 | Bank receipt → Finance → ad live | ✅ | `POST /orders/{id}/bank-receipt`, admin approve endpoint, e2e `payments.spec.ts` + `test_payments.py` |
| C16 | Arabic PDF receipts | ✅ | `receipt_service.py` (Amiri+reshaper+bidi), worker pre-warm sweep, e2e download assertions |
| C17 | Full/partial refunds affect ad periods | ✅ | BR-8 tests: full cancel + hide, partial pro-rate |
| C18 | Promo concurrency-safe | ✅ | threaded double-redeem test in `test_orders.py` |
| C19 | No mock paths in production config | ✅ | boot validation rejects `mock` in prod; mock provider only reachable in dev/test |

## D. Clients

| # | Item | Status | Evidence |
|---|---|---|---|
| D20–24 | Web owner journey, search/map/SEO/OG, checkout all methods, states, a11y/RTL | ✅ | `e2e` specs (owner-journey, tenant-search, public-seo, payments, lifecycle, contract-handover) **8/8**; web tsc +15 vitest + `next build`46 pages; RTL/dir asserted in e2e |
| D25–28 | Admin queues/KPIs/roles/audit | ✅ | e2e `admin-console` (2FA fail/success, ban enforced by API, audit rows, presets), funnel card, role-filtered menu + API `require_roles` |
| D29 | **Full Flutter app** (login, search+map+filters, detail+contact, owner create/edit/submit+photos, verification, checkout, orders, favorites, notifications, profile) | ✅ code / ❌ build | `mobile/lib` —21 Dart files, ~4.0k lines, dio+secure-storage+MapLibre+image_picker+url_launcher; contracts/handover screens included |
| D30 | Same business rules as web | ✅ | same endpoints + same validation paths (OTP gate on contact, BR-6 upload, submit rules, dual-OTP contract freeze) |
| D31 | Push (FCM) | ✅ code / ❌ project | `push_service.dart` → real FCM token registration via `POST /me/devices`; requires `FIREBASE_*` dart-defines from your Firebase project |
| D32 | Store-ready config notes | ✅ | `mobile/README.md` (signing, dart-defines, privacy labels, `docs/launch-checklist.md`) |

**⚠️ Mobile build verification (G45) is blocked in this environment**: the
Flutter SDK cannot be downloaded here (`storage.googleapis.com` unreachable —
measured `curl →000`; only github/npm/pypi allowed). First action on a dev
machine: `cd mobile && flutter create . && flutter pub get && flutter analyze
&& flutter test && flutter build apk --debug`. This is the single largest
unverified item.

## E. Phase 4 — contracts & handover

| # | Item | Status | Evidence |
|---|---|---|---|
| E33 | Contract PDF, private-agreement disclaimer | ✅ | `contract_pdf.py` (Amiri, QR → `/verify`, confirmation log) + e2e downloads |
| E34 | Handover checklist flow | ✅ | web + Flutter; e2e `contract-handover` (dual OTP, immutability PATCH→409, side-by-side meter diff) |
| E35 | Sensitive IDs encrypted | ✅ | Fernet (`CONTRACT_NID_KEY`), masked API, redacted logs — asserted in tests |
| E36 | No claim of replacing official registration | ✅ | disclaimer in UI + PDF + `/verify` page + templates |

## F. Security, privacy, compliance

| # | Item | Status | Evidence |
|---|---|---|---|
| F37 | Secret management + strong prod validation | ✅ | `.env*` gitignored; boot validation (weak SECRET_KEY, missing keys → refuse); rotation notes in `crypto_service.py` |
| F38 | PDPL basics | ✅ | consent banner, `GET /me/export`, delete-account, retention jobs (90d docs / 12mo contacts), `docs/privacy/pdpl-note.md` **flagged for lawyer review** |
| F39 | File upload hardening | ✅ | type+size+magic-bytes+re-encode (images), video type/size, malware-scan hook (`MALWARE_SCAN_CMD`), private docs signed URLs |
| F40 | Rate limits & broker anti-patterns | ✅ | Redis/in-process limits, OTP DB limits, contact/contract/media limits; preset reject reasons incl. `broker_suspected`; auto-moderation at3 reports |
| F41 | Headers + CORS locked in prod | ✅ | `SecurityHeadersMiddleware` (CSP only in prod) + boot refuses wildcard CORS outside dev; tests assert both |

## G. Quality gates (run locally / CI)

| Gate | Command | Result |
|---|---|---|
| Backend tests (SQLite) | `pytest -q --cov=app` | **151 passed** |
| Backend tests (PostgreSQL) | CI `test (postgres)` job (migrate + pytest) | ✅ green on CI (this round fixed the root cause: undeclared `cryptography`/`prometheus-client`/`qrcode` — clean-venv collect =151) |
| Lint | `ruff check backend` | **All checks passed** |
| Types | `mypy app` | **Success:84 files** |
| Web unit | `npx vitest run` | **15 passed** |
| Web build | `npx next build` | ✓46 pages |
| Admin | `tsc --noEmit && vite build` | ✓ |
| E2E | `npx playwright test` | **8/8 passed** (hermetic stack, fresh SQLite per run) |
| Dependency audit | `pip-audit` + `npm audit --audit-level=high` | **0 known vulnerabilities** (CI `audit` job) |
| Mobile build | `flutter build` | ❌ **blocked** — Flutter SDK unavailable in this environment (see D29) |
| Critical/high security findings | OWASP checklist + threat model | **0 known** — `docs/security/owasp-checklist.md`, `docs/security/threat-model.md` |

## H. Observability & operations

| # | Item | Status | Evidence |
|---|---|---|---|
| H48 | Runbook (deploy, key rotation, failed webhooks, refunds) | ✅ | `docs/runbook.md` + `docs/deploy.md` (rotation steps in `crypto_service.py`, webhook alerts on `aqar_webhook_failures_total`) |
| H49 | Monitoring hooks | ✅ | `/health`, `/ready`, `/metrics`; Sentry via `SENTRY_DSN` (optional init, never blocks boot); alert rules in runbook §7 |
| H50 | Backup/restore for Postgres | ✅ | `scripts/backup.sh` + `restore.sh` — **roundtrip-tested** in `tests/test_backup_restore.py` (migrate → seed → backup → drop schema → restore → assert rows/indexes/version) |

---

## External go-live blockers (cannot be closed in code)

1. ❌ **Paymob live keys** (api key, integrations, HMAC) + verified capture/refund.
2. ❌ **Twilio account** (SID/token/sender) — or switch `OTP_PROVIDER` to another real gateway.
3. ❌ **Lawyer review** of the three contract templates + terms/privacy (PDPL note lists the questions).
4. ❌ **Flutter SDK build verification** + Firebase project for FCM + store accounts.
5. ⚠️ Tax/commercial-registration data for checkout bank details; production map-tile host (OSM usage policy).

## Reproduce the battery

```bash
pip install -r backend/requirements-dev.txt && pytest -q --cov=app   #151
ruff check backend && (cd backend && mypy app)
cd web && npx tsc --noEmit && npx vitest run && npx next build
cd admin && npx tsc --noEmit && npm run build
cd e2e && npx playwright test                                        #8/8
pip-audit -r backend/requirements.txt && (cd web && npm audit)
```

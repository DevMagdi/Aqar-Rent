# PRODUCTION_READINESS.md — عقار رينت / Aqar Rent

Honest pass/fail evidence after the Phase 5 build, dated **2026-11-02**.
Re-run the commands below to refresh. Legend: ✅ pass with evidence ·
⚠️ pass with caveat · ⛔ external blocker (credential / legal / hardware).

**Verdict: source-complete and ready for staging/pilot. NOT cleared for public
launch** until the external items in `docs/external-dependencies.md` are closed.
The product has no "coming soon" pages, no placeholder copy and no mock-only
production path; every production flow uses real providers or refuses to boot.

## A. Code & automated evidence

| # | Item | Status | Evidence |
|---|---|---|---|
| A1 | Backend tests | ✅ | `backend/.venv/bin/python -m pytest -q` → **162 passed** with `pgserver` installed (CI path); **161 passed, 1 skipped** in a minimal sandbox. Includes 11 new Phase 5 tests and the updated backup/restore head assertion |
| A2 | Lint / types | ✅ | `ruff check app tests` clean · `mypy app` clean (97 files) |
| A3 | Migration | ✅ / ⚠️ | `0001→0007` verified on SQLite and on a real throwaway PostgreSQL in `test_backup_restore.py` (pgserver); **PostGIS staging rehearsal + production backup drill remain go-live gates** |
| A4 | Web | ✅ | `npx tsc --noEmit`, `npm test` (**21 vitest**: 15 core + 6 Mantiq design-system compliance), `npm run build` all pass; pricing/office/legal pages added |
| A5 | Admin | ✅ | `npx tsc --noEmit`, `npm run build` pass; 4 new admin surfaces |
| A6 | Mobile source | ⚠️ | `flutter analyze/test/build` are executed by `.github/workflows/mobile.yml` with a real SDK — **Flutter SDK unavailable in this sandbox** (`storage.googleapis.com` blocked). All source, native shells, tests, CI and build scripts are committed. |
| A7 | API docs | ✅ | `scripts/generate-api-docs.py` regenerates `docs/openapi.json` (113 paths, 134 schemas) and Postman collection (137 requests) from the live app |
| A8 | Static copy | ✅ | No "coming soon"/DRAFT banners; all six static pages complete in AR/EN |
| A9 | Design system | ✅ | `main` Mantiq navy+gold migration merged; token files byte-identical, zero hard-coded hex in TS/TSX, no white-on-gold — enforced by `tokens.test.ts` |
| A10 | E2E specs | ⚠️ | `npx playwright test --list` → 10 tests in 8 specs; browser download blocked in sandbox, so execution is a CI/go-live gate |

## B. Trust, offices, pricing (Phase 5)

| # | Item | Status | Evidence |
|---|---|---|---|
| B1 | 4-level trust ladder + public badges | ✅ | `trust_service.py`, `search_service.py::_owner_trust`, `test_trust_ladder_badges_appeal_and_premium_grant` |
| B2 | Structured rejections + one-round appeal | ✅ | `/trust/reject-reasons`, `/me/verification/{id}/appeal`, admin appeals queue, audit log |
| B3 | Office accounts, teams, CRM-lite, dashboard | ✅ | `office_service.py`, `/offices/*`, `test_office_team_invites_leads_and_dashboard` |
| B4 | Weekly ad preserved + packages + subscriptions | ✅ | `seed_growth`, `/pricing`, `test_multiweek_package_order_validates_and_settles`, `test_subscription_checkout_settles_idempotently_and_raises_cap` |
| B5 | Entitlements applied to creation AND activation | ✅ | `entitlements.effective_listing_cap` called from `listing_service.check_listing_cap` and `order_service._check_running_ad_cap` |
| B6 | Admin plan/package management | ✅ | `/admin/growth/*`, `AdminGrowth.tsx`, test |

## C. Legal & evidence

| # | Item | Status | Evidence |
|---|---|---|---|
| C1 | Production Arabic private-agreement templates | ✅ | 3 full templates (16 clauses each), no draft banner; `test_contracts.py` |
| C2 | Professional Arabic PDF + QR + hash + dual OTP | ✅ | `contract_pdf.py`, `contract_service.py`, tests |
| C3 | Honest registry status / no Ejar claim | ✅ | `integrations/registry.py`, `/contracts/{id}/registry-status`, test |
| C4 | Rich handover comparison + meter validation | ✅ | `handover_service.comparison_for`, `test_handovers.py` |
| C5 | Egyptian lawyer final sign-off | ⛔ | `docs/legal-notes.md` §3 lists 7 explicit items; written opinion required before launch |
| C6 | Store/privacy label legal review | ⛔ | `mobile/ios/Runner/PrivacyInfo.xcprivacy` + `docs/privacy/pdpl-note.md` |

## D. Payments, SMS, security

| # | Item | Status | Evidence |
|---|---|---|---|
| D1 | Paymob card/wallet/Fawry + HMAC + IP allowlist + idempotency + refunds | ✅ code / ⛔ live keys | `services/payments/paymob.py`, `test_payments.py` |
| D2 | Bank transfer approval + receipt handling | ✅ | `test_payments.py`, admin console |
| D3 | Append-only payment audit + reconciliation + failure alerting | ✅ | `payment_audit.py`, `/admin/growth/reconciliation`, `core/metrics.py` |
| D4 | Twilio SMS provider | ✅ code / ⛔ account | `integrations/otp/twilio.py` |
| D5 | Production refuses mock/console/weak secrets | ✅ | `Settings.validate_runtime()`, `test_production_config.py`, `test_phase5_growth.py` |
| D6 | `ENVIRONMENT=production` alias without breaking `APP_ENV` | ✅ | `config.py::_environment_alias`, test |
| D7 | OWASP / threat model / redacting logs / Prometheus / Sentry | ✅ | `docs/security/*`, `core/logging.py`, `core/metrics.py` |

## E. External blockers (unchanged in nature, now itemised)

⛔ Paymob live keys · Twilio/approved Egyptian sender · Egyptian lawyer sign-off ·
Apple Developer + Google Play accounts · Firebase project & APNs · tax/commercial
registration data · production map-tile host · domain association files with real
signing fingerprints · Flutter SDK + macOS build machine · store screenshots/video
capture. Full owners/actions: `docs/external-dependencies.md`; ordered gates:
`docs/go-live-checklist.md`.

## F. What changed vs. the previous verdict

The earlier file said "READY FOR STAGING / PILOT" with 151 backend tests and
four blockers. This round adds: a complete sustainable revenue model, first-class
offices, multi-level trust with appeals, production-grade private-agreement
templates and legal framing, payment audit/reconciliation, strict production
config (including `ENVIRONMENT=production`), a real Flutter production client with
native shells/CI, pricing/office/admin/web surfaces, generated API docs, and 11
new backend tests (162 total with pgserver; 161 + 1 skip without). The verdict remains **staging/pilot** because
credentials, legal sign-off and store/hardware items are outside the code.

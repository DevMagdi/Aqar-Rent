# عقار رينت · Aqar Rent

**Egypt's most trusted, transparent, broker-optional rental platform.**
Individuals list directly; verified real-estate offices manage owners' units,
teams and leads. The platform **never holds rent money or deposits**, takes
**no commission on rent**, and its contracts are **private agreements** — not
notarised, not officially registered, not executive instruments. Arabic-first
with perfect RTL, full English.

Revenue: a flat **500 EGP / 7-day ad** (unchanged entry point), multi-week
packages with discounts/priority, monthly **owner subscriptions** (3+ units,
analytics, bulk tools) and **office/agency subscriptions** (teams, branded
pages, CRM-lite, dashboards), plus optional premium verification and contract
packages. All prices are DB-backed and served from `/api/v1/pricing`.

Visual language: **Mantiq design system** — Mantiq Navy `#16273B` + Mantiq Gold
`#BDA77E`, single source of truth in `web/src/styles/tokens.css` /
`admin/src/styles/tokens.css`. Compliance (hex-free TS/TSX, no white-on-gold,
byte-identical token files) is test-enforced; see ASSUMPTIONS “Design System
Migration” (#91–101).

> **Status:** source-complete and tested in this sandbox: backend 162 pytest
> (161 + 1 skipped when bundled PostgreSQL is absent), ruff + mypy clean, web unit + design-compliance
> tests, web/admin typecheck and production builds, mobile static checks, and
> generated API artifacts in sync. **Not cleared for public launch:** production
> go-live still requires external credentials/accounts and an Egyptian lawyer's
> final sign-off — see [`docs/go-live-checklist.md`](docs/go-live-checklist.md)
> and [`docs/external-dependencies.md`](docs/external-dependencies.md). **Nothing
> here is a "coming soon" placeholder.** Flutter release builds, Playwright e2e,
> PostgreSQL migration rehearsal and live provider captures require SDK/browsers
> and credentials unavailable in this sandbox; CI and the go-live checklist own
> those gates.

---

## What's in the repository

```
backend/    FastAPI + SQLAlchemy 2 + Alembic — 113 API paths, migrations 0001…0007
web/        Next.js 16 App Router (TS/Tailwind) — AR/EN public + owner + office + pricing
admin/      React 19 + Vite — staff console (plans, offices, appeals, reconciliation)
mobile/     Flutter production client (Android + iOS native shells included)
e2e/        Playwright suite on a hermetic stack
docs/       OpenAPI + Postman, architecture, legal, pricing, acceptance, go-live
scripts/    backup/restore, app-links generation, API-doc generation, mobile builds
loadtest/   Locust suite + checkout bench (100k-listing report)
docker-compose*.yml / Makefile   dev & staging stacks
```

### Feature highlights

**Trust & verification** — four transparent levels (`phone → id → ownership →
premium`), public badges on cards and detail pages, localizable structured
rejection reasons, one-round appeals with staff re-review, configurable
anti-fraud rate limits, and honest "documents reviewed by our team, not a
government check" copy everywhere.

**Offices & agents** — dedicated office profiles with branded public pages,
commercial-register review, phone invitations activated on first OTP login,
seat limits, per-listing agent attribution, a lead pipeline (`new → won`),
timeline events, follow-ups and a conversion dashboard. Optional office↔owner
commission is a private record only.

**Pricing & payments** — `/pricing` single source of truth; weekly ads, 2/4/8-week
packages, owner/office subscriptions via the same Paymob/bank/refund pipeline,
HMAC webhooks, idempotency, Arabic receipts, **append-only SHA-256 payment audit
trail**, reconciliation report and Prometheus failure counters. Production
refuses mock payments, console OTP, weak secrets and missing allowlists;
`ENVIRONMENT=production` is accepted as an alias for `APP_ENV=prod`.

**Contracts & handovers** — three full Arabic private-agreement templates
(furnished / unfurnished / commercial), dual OTP confirmation, SHA-256
immutability, professional Arabic PDF with QR verification, encrypted NIDs,
handover media/meter readings and a rich side-by-side comparison. A clean
`OfficialRegistryAdapter` seam returns `unavailable` today because Egypt has no
Ejar-equivalent official digital registry. Remaining lawyer sign-off is listed
explicitly in `docs/legal-notes.md`.

**Mobile (priority)** — feature-first Flutter client with native Android/iOS
shells, adaptive icons/splash, permission justification, privacy manifest,
go_router deep links, real FCM (foreground + tap routing), biometric re-lock,
onboarding, bilingual in-code i18n, offline cache, image caching/compression,
skeletons/empty/error states, and full owner/tenant/office/contract parity.
Release builds fail fast without real HTTPS API, tile host and Firebase config.
See [`mobile/README.md`](mobile/README.md).

---

## Quick start

```bash
cp .env.example .env        # change SECRET_KEY + staff passwords
make up                     # api · worker · postgres+postgis · redis · minio
make migrate                # alembic upgrade head → 0007
make seed                   # locations, 500 EGP plan, 3 packages, 4 plans, super admin
make seed-demo              # demo owner/tenant/listings
make web                    # http://localhost:3000/ar
make admin                  # http://localhost:5173
```

API + Swagger: <http://localhost:8000/docs> · `/health` · `/ready` · `/metrics`.
Seeded dev admin: `admin@aqar-rent.dev` / `ChangeMeAdmin!2026` + TOTP
`JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP` (dev only; prod refuses weak defaults).

For Flutter, see the exact commands in `mobile/README.md` and
`scripts/mobile-build.sh`.

## Quality gates

```bash
# Backend (dev, SQLite)
python3.12 -m venv backend/.venv && source backend/.venv/bin/activate
pip install -r backend/requirements-dev.txt
export DATABASE_URL="sqlite:///./dev.db"   # or postgresql+psycopg://…
cd backend && alembic upgrade head && python -m app.scripts.seed --demo
uvicorn app.main:app --reload --port 8000

# Web / admin (separate shells; mock pay is dev-only)
cd web   && npm install && BACKEND_URL=http://localhost:8000 NEXT_PUBLIC_MOCK_PAY=true npm run dev   # :3000
cd admin && npm install && BACKEND_URL=http://localhost:8000 npm run dev                            # :5173
```

### Tests & quality

```bash
make test        # backend pytest (SQLite; TEST_DATABASE_URL for PostgreSQL)
make lint        # ruff
make typecheck   # mypy
cd backend && .venv/bin/python -m pytest -q          # 162 passed (161 + 1 skip without pgserver)
cd backend && .venv/bin/python -m ruff check app tests && .venv/bin/python -m mypy app
cd web     && npx tsc --noEmit && npx vitest run && npm run build   # unit + Mantiq compliance
cd admin   && npx tsc --noEmit && npm run build
cd backend && .venv/bin/python ../scripts/generate-api-docs.py       # OpenAPI + Postman in sync
cd ..      && backend/.venv/bin/python scripts/check_mobile.py       # SDK-free Flutter static check
make e2e         # Playwright: 10 tests in 8 specs (incl. Mantiq computed styles/WCAG)
                 # requires browser download; not runnable in this sandbox
# Mobile (requires Flutter SDK; runs in CI via .github/workflows/mobile.yml):
flutter analyze --fatal-infos && flutter test && flutter test integration_test/
```

## Documentation

| Doc | Contents |
|---|---|
| `docs/decisions.md` | every significant decision + rationale + code |
| `docs/acceptance-criteria.md` | testable criteria for every major feature |
| `docs/pricing-packaging.md` | business model and packaging explanation |
| `docs/legal-notes.md` | legal framing + explicit external lawyer sign-off list |
| `docs/go-live-checklist.md` | ordered production go-live gates |
| `docs/external-dependencies.md` | everything that cannot be solved in code |
| `docs/openapi.json` / `docs/api-collection.json` | generated API surface (113 paths / 137 requests) |
| `mobile/README.md` | exact mobile build/store steps + acceptance criteria |
| `mobile/docs/demo-script.md` | store screenshots + 75s demo video script |
| `docs/architecture.md`, `deploy.md`, `runbook.md`, `backup-restore.md` | ops |
| `docs/security/*`, `docs/privacy/pdpl-note.md`, `docs/uat/plan.md` | security/privacy/UAT |
| `PRODUCTION_READINESS.md` | honest pass/fail evidence and verdict |

## External go-live blockers

Live Paymob keys, Twilio (or approved Egyptian SMS sender), Egyptian lawyer
sign-off, Apple/Google developer accounts, Firebase project + store credentials,
tax/commercial-registration data, production map-tile host, domain association
files, Flutter SDK + macOS build machine. Full table with owners/actions in
`docs/external-dependencies.md`. Code paths for all of these are real; they are
credential/legal/hardware items, not unfinished features.

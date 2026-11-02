# Aqar Rent — عقار ربنا

A broker-free rental marketplace for Egypt. Owners pay a **flat ad fee
(500 EGP / 7 days per listing — price lives in the `plans` table)** — the
platform takes **no commission**, never holds rent or deposits, and never
mediates money between landlord and tenant. Arabic-first (RTL), English
secondary.

> **Status — everything below is implemented and tested:**
> - **Phase 1** backend core (OTP auth, locations, listings+media, verification,
>   moderation, search, admin API) — 108 tests
> - **Phase 2** payments (Paymob card/wallet/Fawry + MockProvider for dev,
>   orders/promos/receipts/refunds/bank transfers) — 112 tests
> - **Phase 3A** `/web` (Next.js), `/admin` (React+Vite), Playwright e2e
> - **Phase 3B (mini)** Flutter `/mobile` — contract & handover screens
> - **Phase 4A** standard lease contracts (templates, dual-OTP confirmation,
>   SHA-256 immutability, Arabic PDF + QR, encrypted national IDs, optional
>   contract fee, public `/verify/{ref}`) — web + Flutter clients
> - **Phase 4B** handovers (check-in/check-out checklists, media, dual-OTP,
>   side-by-side diff, Arabic PDFs) — web + Flutter clients
> - **Phase 4C** hardening & launch readiness: security/privacy/reliability/
>   performance/DevOps/launch-kit docs + code (see [/docs](#docs))
>
> Test totals: **backend141** (pytest) · **web15** (vitest) · **e2e7 specs**
> (Playwright) · ruff + mypy clean · CI green.

---

## Repository layout

```
backend/    FastAPI + SQLAlchemy 2 + Alembic (Python 3.12) — API, worker, migrations0001…0006
web/        Next.js 16 App Router (TS + Tailwind 4) — public site, tenant & owner flows, contracts
admin/      React 19 + Vite 8 (Tailwind 4) — staff console (moderation/finance/super-admin)
mobile/     Flutter mini app — contract + handover screens (see mobile/README.md)
e2e/        Playwright suite (7 specs) on a hermetic stack (:8010/:3010/:5180)
docs/       OpenAPI + Postman collection + architecture/runbooks/security/privacy/load-test/UAT
scripts/    backup.sh / restore.sh (tested)
loadtest/   Locust suite + checkout bench (100k-listing report in docs/load-test/)
docker-compose.yml          dev stack: api · worker · postgres+postgis · redis · minio
docker-compose.staging.yml  staging stack (production images)
Makefile     make up / test / lint / e2e / web / admin …
```

---

## Quick start

### 1) Docker (recommended — full stack)

```bash
cp .env.example .env        # change SECRET_KEY + staff passwords
make up                     # api, worker, postgres+postgis, redis, minio
make migrate                # alembic upgrade head
make seed                   # 27 governorates, plan (500 EGP/7d), super admin
make seed-demo              # + demo owner/tenant/listings with media
```

* API + Swagger UI: <http://localhost:8000/docs> · health: `/health`,
  readiness: `/ready`, metrics: `/metrics`
* MinIO console: <http://localhost:9001> (minioadmin/minioadmin)
* Web: `make web` → <http://localhost:3000/ar> · Admin: `make admin` →
  <http://localhost:5173> (seeded login `admin@aqar-rent.dev` /
  `ChangeMeAdmin!2026` + TOTP secret `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP` — dev
  defaults only; prod refuses to start without real `STAFF_SUPER_ADMIN_*`)

### 2) Local development (no Docker)

```bash
# backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements-dev.txt
export DATABASE_URL="sqlite:///./dev.db"   # or postgresql+psycopg://…
cd backend && alembic upgrade head && python -m app.scripts.seed --demo
uvicorn app.main:app --reload --port 8000

# web (separate shell)
cd web && npm install
BACKEND_URL=http://localhost:8000 NEXT_PUBLIC_MOCK_PAY=true npm run dev   # :3000

# admin (separate shell)
cd admin && npm install
BACKEND_URL=http://localhost:8000 npm run dev                            # :5173
```

### Tests & quality

```bash
make test        # backend pytest (SQLite; TEST_DATABASE_URL for PostgreSQL)
make lint        # ruff
make typecheck   # mypy (mypy-lite config)
cd web  && npx tsc --noEmit && npx vitest run   # types +15 unit tests
cd admin && npx tsc --noEmit && npm run build
make e2e         # Playwright: 7 specs on a hermetic stack (fresh SQLite)
```

---

## Feature map (as built)

### Public site (`web/`)

- Home (search bar + quick filters + latest), results **list + map sharing
  one filter state** (price, type, rental type, furnished, bedrooms, baths,
  area, floor, amenities, available-from, bbox; sort newest/price/area;
  infinite scroll 20/page; “search this area”), listing detail, six static
  pages (about, how-it-works, terms, privacy, content-rules, support).
- SEO: `/{locale}/rent/{gov}/{city}/{uuid}-{slug}` permalinks, sitemap.xml,
  robots.txt, canonical + hreflang, OG images (`/og`), JSON-LD
  `Residence`+`Offer`, `next/image` thumbnails, bundled Amiri font.
- MapLibre GL with **env-driven raster tiles** (no paid key), HTML price
  pins, GeoJSON clustering; detail page shows an approximate 150 m circle with
  login-gated exact reveal.

### Authenticated (web)

- OTP login (resend timer), profile/language/delete-account, favorites,
  notifications center, **owner dashboard** (views/contacts/days-left, renew,
  mark-rented), **6-step add/edit wizard** (draft autosave, photos 3–15
  client-compressed ≤1.5 MB with progress/retry/reorder, Arabic validation),
  verification upload, **checkout** (weeks 1–4, promo with live totals,
  card/Fawry/Vodafone/bank + receipt upload, success/pending/failed screens,
  receipts PDF).

### Contracts & handovers (Phase 4A/4B — web + API + mini Flutter)

- Editable Arabic **template files** (`backend/contract_templates/*.txt`) —
  residential unfurnished / furnished / commercial, each headed
  “مسودة — تحتاج مراجعة محامي…”. UI and PDF state: *“This is a private
  agreement template and does not replace official registration or
  notarization.”*
- Wizard: both parties’ names + national IDs (**Fernet-encrypted at rest**,
  masked in the API, never logged), unit address prefilled from the listing,
  dates, rent, yearly increase, deposit + refund deadline (default 30 days),
  payment day, utilities, termination, notes.
- API: `POST/GET/PATCH /contracts`, `POST /contracts/{id}/request-confirmation`,
  `POST /contracts/{id}/confirm` (**fresh OTP per party**),
  `GET /contracts/{id}/pdf`, `POST /contracts/{id}/fee-order`
  (`orders.kind=contract_fee`, default0 EGP via `CONTRACT_FEE_EGP`,
  suggested50), public `GET /verify/{reference_no}`.
- On **both** confirmations the contract freezes: SHA-256 of the final terms,
  timestamps + IPs + device info in `confirmations_log`, Arabic PDF
  (Amiri + reshaper/bidi) with reference number, **QR → /verify/{ref}** and
  the confirmation log.
- Handovers: `POST /contracts/{id}/handovers` (check-in; check-out **from** a
  confirmed check-in), `PATCH`, `POST /handovers/{id}/media` (photos/videos,
  re-encoded), `POST /handovers/{id}/confirm` (dual OTP → immutable hash),
  `GET /handovers/{id}/pdf`; web UI shows the **side-by-side** room/condition
  diff + meter differences; clients: web + mini Flutter app.

### Staff console (`admin/`)

Dashboard KPIs + conversion funnel · moderation (approve / reject presets) ·
verification queue (signed-URL viewer) · reports (4 API actions) · users
(ban/unban, caps) · payments + revenue + refunds + CSV · bank approvals ·
plans/promos CRUD · staff role matrix + audit activity · audit log with
before/after diffs · read-only settings presets. Login = email + password +
**TOTP 2FA**.

### Backend hardening (Phase 4C — code)

- `CommitBeforeSendMiddleware` — commits before the response hits the wire
  (kills keep-alive read-your-writes races).
- **Retention jobs**: verification docs purged 90 days after a final decision
  (unless an open report), contact events after 12 months.
- **`GET /me/export`** — full JSON data export; delete-account endpoint.
- **Log redaction** — phones/NIDs/tokens masked (`[PHONE]`, `[NID]`, `[TOKEN]`).
- **Prometheus** `/metrics` (request latency, webhook/payment/job failure
  counters) · `/ready` readiness (DB) · optional **Sentry** via `SENTRY_DSN`.
- **Security headers + prod CSP** · in-process/Redis **cache** for locations
  & plans (`REDIS_URL`, disabled under test) · funnel
  `GET /admin/analytics/funnel`.
- **Search at scale**: denormalized `ad_priority`/`ad_starts_at` sort keys +
  composite indexes — p95 **5 ms** sequential at 100k listings
  (report: `docs/load-test/report.md`).

---

## Documentation (/docs)

| Doc | Contents |
|---|---|
| `docs/openapi.json` / `docs/api-collection.json` | full API surface (74 paths) + Postman collection |
| `docs/architecture.md` | system diagram, services, domain rules, hardening |
| `docs/runbook.md` | moderation SLA24h, reports/bans, refunds, bank approvals, alert rules |
| `docs/deploy.md` | env separation, staging compose, CI/CD, migrations, rollback, CDN |
| `docs/backup-restore.md` | pg_dump/restore procedure — **covered by an automated roundtrip test** |
| `docs/security/owasp-checklist.md` | OWASP Top 10 with evidence |
| `docs/security/threat-model.md` | broker-impersonation & fake-listing abuse |
| `docs/security/dependency-report.md` | pip-audit + npm audit results (0 vulns) + CI gates |
| `docs/privacy/pdpl-note.md` | data inventory, retention, user rights — **flagged for legal review** |
| `docs/load-test/report.md` | 100k-listing load test, p95 vs targets, fixes found |
| `docs/uat/plan.md` | acceptance-criteria checklist mapped to automated evidence + manual script |
| `docs/launch-checklist.md` | pilot plan (1–2 districts), FIRSTAD promo, go-live blockers, store submission |
| `ASSUMPTIONS.md` | every decision/deviation (items 1–70) |

## Operations cheatsheet

```bash
make test && make lint && make typecheck   # backend gates
make e2e                                    # full Playwright suite
DATABASE_URL=… ./scripts/backup.sh          # daily backup (docs/backup-restore.md)
curl :8000/ready  :8000/metrics             # probes
```

## Roadmap

- **Phase 4 remaining go-live items** (see `docs/launch-checklist.md`):
  Paymob live keys, lawyer review of contract templates/terms, tax/commercial
  registration, production map tiles, SMS/WhatsApp providers, store accounts.
- **Phase 5 ideas**: contract-fee paid tier, image forensics at moderation,
  pg_trigram full-text search, push/WhatsApp delivery channels (design in
  notifications table already).

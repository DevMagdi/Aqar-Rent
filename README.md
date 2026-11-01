# Aqar Rent — إيجار مباشر

A broker-free rental marketplace for Egypt. Owners pay a **flat 500 EGP per 7 days per listing**
to advertise — the platform takes **no commission**, never holds rent or deposits, and never
mediates money between landlord and tenant. Arabic-first (RTL), English secondary.

> **Status:** Phase 1 (backend core) implemented — auth (OTP), locations, listings + media,
> owner verification, moderation, search, admin API, seed data, tests, OpenAPI docs.
> Phases 2–4 (payments, clients, contracts) are planned next — see [Roadmap](#roadmap).

---

## Repository layout

```
/           backend/      FastAPI + SQLAlchemy 2 + Alembic (Python 3.12)
            web/          Next.js public site + owner dashboard   (Phase 3)
            mobile/       Flutter app (Android + iOS)             (Phase 3)
            admin/        React + Vite admin panel                (Phase 3)
            docs/         OpenAPI export + API collection
            docker-compose.yml   api · worker · postgres+postgis · redis · minio
            Makefile      make up / test / seed / lint …
```

## Quick start

### 1) Docker (recommended — full stack)

```bash
cp .env.example .env        # then change SECRET_KEY + staff passwords
make up                     # builds & starts api, worker, postgres+postgis, redis, minio
make migrate                # alembic upgrade head (full schema + PostGIS geo column)
make seed                   # 27 governorates, cities/districts, default plan, super admin
```

* API + Swagger UI: <http://localhost:8000/docs>
* MinIO console: <http://localhost:9001> (minioadmin / minioadmin)
* Worker runs the hourly jobs (ad expiry, Fawry 48h expiry, reminders, report threshold).

### 2) Local development (no Docker)

```bash
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
export DATABASE_URL="postgresql+psycopg://aqar:aqar@localhost:5432/aqar"  # or sqlite:///./dev.db
alembic upgrade head
python -m app.scripts.seed --demo        # --demo adds owner/tenant/listings
uvicorn app.main:app --reload --port 8000
```

### Tests & quality

```bash
make test        # pytest + coverage (SQLite by default; ~78 tests, 93% coverage)
make lint        # ruff check
make typecheck   # mypy (mypy-lite config)
```

The same suite runs against **PostgreSQL + PostGIS** when `TEST_DATABASE_URL` is set
(CI runs both variants — see `.github/workflows/ci.yml`).

## Architecture

```mermaid
flowchart LR
    subgraph Clients
        W[Web — Next.js RTL<br/>public SEO + owner dashboard]
        A[Android / iOS — Flutter]
        AD[Admin panel — React + Vite]
    end

    subgraph Stack["docker-compose stack"]
        API["API — FastAPI<br/>/api/v1 · Swagger /docs"]
        WK["Worker — ARQ<br/>hourly jobs"]
        DB[("PostgreSQL 16 + PostGIS<br/>listings.geo · GiST index")]
        RD[("Redis")]
        S3[("MinIO / S3<br/>media + private documents")]
    end

    W --> API
    A --> API
    AD -->|/api/v1/admin · staff 2FA| API
    API --> DB
    API --> S3
    API -->|rate-limits / future queues| RD
    WK --> DB
    WK --> RD
    WK --> S3
    API -.OTP console/SMS provider.-> API
```

### Request flow (listing lifecycle)

```mermaid
stateDiagram-v2
    [*] --> Draft: POST /listings
    Draft --> Submitted: POST /listings/{id}/submit\n(3–15 photos, proof uploaded, no dup photo)
    Submitted --> Approved: moderator approve\n(BR-6: verified owner)
    Submitted --> Rejected: preset reason
    Rejected --> Draft: owner edits & resubmits
    Approved --> Active: paid ad period opens\n(Phase 2 gateway / bank approval)
    Active --> Expired: hourly job past ends_at\n(hidden from search — BR-3)
    Expired --> Active: owner renews order
    Active --> Rented: owner marks rented
    Active --> Submitted: 3 distinct reports\n(auto-moderation)
    Active --> Removed: admin removes
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `APP_ENV` | `dev` | `dev` \| `test` \| `prod` (prod refuses weak seeded admin) |
| `DEBUG` | `false` | When true, OTP codes are returned in the response (dev only) |
| `SECRET_KEY` | dev value | **Required in prod** — signs JWTs, OTP hashes, file tokens |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins |
| `DATABASE_URL` | `postgresql+psycopg://aqar:aqar@localhost:5432/aqar` | SQLAlchemy URL |
| `REDIS_URL` | `redis://localhost:6379/0` | Worker + future queues |
| `JWT_ACCESS_MINUTES` | `15` | Access token lifetime |
| `JWT_REFRESH_DAYS` | `30` | Refresh token lifetime |
| `BCRYPT_ROUNDS` | `12` | Staff password hashing cost |
| `OTP_PROVIDER` | `console` | OTP provider interface impl (`console` in dev) |
| `OTP_TTL_MINUTES` | `5` | OTP validity |
| `OTP_MAX_ATTEMPTS` | `5` | Wrong-code attempts before burn |
| `OTP_MAX_PER_HOUR` | `5` | Requests per phone number per hour |
| `STORAGE_BACKEND` | `local` | `local` (dev) \| `s3` (MinIO in docker) |
| `STORAGE_LOCAL_ROOT` | `./data/storage` | Local media root |
| `S3_ENDPOINT_URL` / `S3_PUBLIC_ENDPOINT_URL` | `http://localhost:9000` | Internal vs browser-reachable MinIO |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | `minioadmin` | Object-storage credentials |
| `S3_BUCKET_MEDIA` / `S3_BUCKET_DOCUMENTS` | `aqar-media` / `aqar-documents` | Buckets (documents = private) |
| `STAFF_SUPER_ADMIN_EMAIL` | `admin@aqar-rent.dev` | Seeded super admin |
| `STAFF_SUPER_ADMIN_PASSWORD` | — | **Required in prod** |
| `STAFF_SUPER_ADMIN_TOTP_SECRET` | — | Base32 TOTP secret (2FA) |
| `BANK_NAME` / `BANK_ACCOUNT_*` / `BANK_IBAN` / `BANK_SWIFT` | example values | Bank-transfer instructions |
| `PAYMENT_PROVIDER` | `mock` | `mock` (offline dev/tests) \| `paymob` (production) |
| `WEBHOOK_SECRET` | empty | HMAC secret for **mock** webfalls (falls back to `SECRET_KEY`) |
| `WEBHOOK_IP_ALLOWLIST` | empty | Comma-separated IPs/CIDRs allowed to `POST /payments/webhook` (empty = all) |
| `ORDER_RATE_LIMIT_PER_HOUR` | `30` | `POST /orders` per-user rate limit |
| `BANK_RECEIPT_MAX_MB` | `5` | Bank-transfer receipt upload cap |
| `PAYMOB_API_KEY` | empty | Paymob Accept API key (auth token) |
| `PAYMOB_INTEGRATION_ID_CARD` / `_WALLET` / `_FAWRY` | empty | Integration ids: card iframe, Vodafone Cash, Fawry kiosk |
| `PAYMOB_HMAC_SECRET` | empty | Callback HMAC-SHA512 secret (dashboard → Settings → Webhooks) |
| `PAYMOB_IFRAME_ID` | empty | Card iframe id |
| `PAYMOB_BASE_URL` | `https://accept.paymob.com` | Gateway base; `PAYMOB_*_URL` / `PAYMOB_IFRAME_URL_TEMPLATE` override individual endpoints |
| `FAWRY_EXPIRY_HOURS` | `48` | Pending Fawry/Vodafone-Cash orders auto-expire (hourly job) |
| `LOG_LEVEL` | `INFO` | Logging level |

## API overview

Base: `/api/v1` · Bearer auth for logged-in users · standard error body
`{code, message, details}` · cursor pagination (`cursor` + `next_cursor`).

| Area | Endpoints |
|---|---|
| Auth (public) | `POST /auth/otp/request`, `/auth/otp/verify`, `/auth/refresh`, `/auth/logout` |
| Me | `GET/PATCH/DELETE /me`, `POST /me/devices`, `POST/GET /me/verification`, `GET /me/listings`, `GET /me/orders` |
| Locations (public) | `GET /locations?parent_id=` |
| Listings | `POST /listings`, `PATCH /listings/{id}`, `POST/DELETE /listings/{id}/media[...]`, `POST /listings/{id}/submit`, `POST /listings/{id}/mark-rented` |
| Search (public) | `GET /listings` (q, governorate/city/district, price, type, furnished, beds/baths, area, floor, amenities, available_from, bbox, sort, cursor, limit≤50), `GET /listings/{id}` (`exact=true` for the precise pin), `GET /listings/{id}/contact` |
| Favorites / Reports | `PUT/DELETE /favorites/{id}`, `GET /favorites`, `POST /listings/{id}/report` |
| Plans / Orders | `GET /plans`, `POST /orders` (BR-5: only after approval; returns `checkout_url`), `GET /orders/{id}`, `POST /orders/{id}/checkout` (re-mint), `POST /promo/validate` |
| Payments | `POST /payments/webhook` (public, HMAC + idempotent), `POST /orders/{id}/bank-receipt`, `GET /orders/{id}/bank-receipt`, `GET /orders/{id}/receipt` (PDF) |
| Notifications | `GET /notifications`, `POST /notifications/read` |
| Files | `GET /files/public/{path}` (media), `GET /files?…` (signed private docs) |
| Admin | `POST /admin/auth/login` (+TOTP), dashboard, moderation approve/reject, verification decisions, reports actions, users ban/cap, payments (filters: date/status/method/owner) + revenue (daily/monthly/by method) + CSV + refunds, **bank transfers** (`GET /admin/bank-transfers`, approve/reject), plans & promo CRUD, audit logs |

Interactive docs: **<http://localhost:8000/docs>** · Exported spec: [`docs/openapi.json`](docs/openapi.json) ·
Collection: [`docs/api-collection.json`](docs/api-collection.json) (Postman **and** Bruno import).

## Payments (Phase 2)

The platform's **only revenue is the ad fee** (500 EGP / 7 days from `plans`, BR-1) —
never rent, never deposits, never commission (BR-10). Cards, Fawry and Vodafone Cash run
through **Paymob**; bank transfers are manual (owner uploads a receipt → Finance approves →
the ad starts). 100 %-discount promo orders skip the gateway and go live immediately.

### Card / wallet / Fawry checkout + webhook

```mermaid
sequenceDiagram
    participant O as Owner (mobile/web)
    participant A as Aqar API
    participant G as Gateway (Paymob / Mock)
    participant W as Webhook POST /payments/webhook

    O->>A: POST /orders {listing_id, weeks, method, promo?}
    A->>A: BR-1 price · BR-2 weeks · BR-5 approved? · BR-7 cap · atomic promo
    A->>G: create_payment (Paymob: auth → order → payment key / invoice)
    A-->>O: 201 {id, checkout_url, payment_reference, expires_at}
    O->>G: pays (card iframe / wallet invoice / Fawry code)
    G->>W: callback (?hmac= for Paymob, ?sig= for mock)
    W->>W: verify signature → SELECT … FOR UPDATE order → idempotent on gateway_txn_id
    W->>A: payment row + ad_period (stacks after current period) + notification
    W-->>G: 200 fast (receipt PDF pre-generated by the worker)
    A-->>O: listing Active, visible in search (BR-3)
```

### Bank transfer (manual)

```mermaid
sequenceDiagram
    participant O as Owner
    participant A as Aqar API
    participant F as Finance (admin)
    O->>A: POST /orders {method: bank_transfer}
    A-->>O: bank instructions + unique reference AQR-…
    O->>A: POST /orders/{id}/bank-receipt (image)
    A->>F: bank_transfers queue (pending)
    F->>A: POST /admin/bank-transfers/{id}/approve | reject {reason}
    alt approved
        A->>A: payment paid + ad period opens + notification bank_transfer_approved
    else rejected
        A->>O: notification bank_transfer_rejected → owner re-uploads
    end
```

**Refunds (BR-8):** `POST /admin/payments/{id}/refund` (Finance) calls `provider.refund`,
records the `refunds` row, then **cancels** the order's ad period on a full refund or
**shortens it proportionally** on a partial one — the listing leaves search as soon as no
period is running. Every action is audit-logged and notifies the owner.

**Receipts:** `GET /orders/{id}/receipt` streams an Arabic-capable PDF (embedded Amiri
font, OFL) with receipt no., owner, listing, weeks, period dates, subtotal, discount,
total, method and date; stored under `receipts/` in object storage. The worker sweep
(`receipt_sweep`, every 10 min) pre-generates them so the webhook stays fast.

### Going live with Paymob — checklist

1. Create the Accept integration(s) in the Paymob dashboard → card, **Vodafone Cash**
   wallet, **Fawry/kiosk**; copy their integration ids.
2. `PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID_CARD/_WALLET/_FAWRY`, `PAYMOB_IFRAME_ID` set.
3. Set the webhook URL in the dashboard (Settings → Webhooks) to
   `https://<your-host>/api/v1/payments/webhook` and copy the **HMAC secret** into
   `PAYMOB_HMAC_SECRET` (verification is HMAC-SHA512 over the 20 ordered callback fields,
   passed as `?hmac=` — implemented in `PaymobProvider.verify_webhook`).
4. `PAYMENT_PROVIDER=paymob`, `WEBHOOK_IP_ALLOWLIST` = Paymob egress ranges if known.
5. `DEBUG=false`, real `SECRET_KEY`, prod admin secrets (no fallbacks), HTTPS only.
6. Sandbox end-to-end: card test payment → webhook → ad active → receipt downloadable →
   refund → ad stops; repeat for Fawry reference and Vodafone Cash invoice.
7. Enable the `worker` container (hourly expiry jobs + receipt sweep) and watch the first
   `ad_expired` / `payment_confirmed` notifications land.

## Business rules (enforced in code + tests)

| # | Rule | Where |
|---|---|---|
| BR-1 | 500 EGP / 7 days stored in `plans`, never hard-coded | `order_service.get_default_plan`, `GET /plans`, tests |
| BR-2 | 1–4 weeks per purchase; total = weeks × plan price | `OrderCreateIn(weeks 1..4)`, `compute_totals` |
| BR-3 | Visible only during an active paid ad period; expiry → hidden ≤1h | search `EXISTS ad_period`, `jobs.end_expired_ad_periods` |
| BR-4 | Default ranking = newest ad start; `priority_weight` for future tiers | `search_service._sort_columns` |
| BR-5 | Payment only after moderator approval | `order_service.create_order` → `ORDER_NOT_APPROVED` |
| BR-6 | Ownership proof uploaded before submit, approved before first approval | `listing_service.submit_listing`, `moderation_service.approve_listing` |
| BR-7 | Max 5 active listings/user (Super Admin can raise) | `listing_service.check_listing_cap`, `PATCH /admin/users/{id}` |
| BR-8 | Refunds full/partial by Finance | `POST /admin/payments/{id}/refund` |
| BR-9 | Promo codes: percent/free weeks, max uses, expiry | `order_service.validate_promo`, promo CRUD |
| BR-11 | Owner phone only for logged-in users; every reveal logged | `GET /listings/{id}/contact` → `contact_events` |
| BR-12 | Real photos (3–15), monthly EGP price, no phone numbers in text/photos | submit checks + perceptual-hash duplicate detection |

## Roadmap

* **Phase 2 — Payments:** ✅ done — `PaymentProvider` (Mock + Paymob for card/Fawry/
  Vodafone Cash), HMAC-verified idempotent webhook with row locks, bank-transfer receipt +
  Finance approval, ad activation & stacked renewals, hourly 48 h order expiry, Arabic PDF
  receipts, refunds that shorten/cancel ad periods, revenue breakdowns + CSV.
* **Phase 3 — Clients:** Next.js public site + owner dashboard, React admin panel, Flutter app,
  notifications, favorites, reports UI.
* **Phase 4 — Contracts:** lease PDF generator (private agreement template — not a substitute
  for official registration), handover checklists, hardening & load-testing notes.

See [ASSUMPTIONS.md](ASSUMPTIONS.md) for every decision made where the spec left room.

## License / legal notes

Contract templates produced by the platform are **private agreements** and do **not** replace
official lease registration with Egyptian authorities.

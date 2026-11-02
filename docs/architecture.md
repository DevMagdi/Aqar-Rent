# Architecture — Aqar Rent (as built)

Broker-free Egyptian rental marketplace: owners pay **ad fees only** (500 EGP /
7 days per listing, price lives in the `plans` table), tenants never pay, the
platform never touches rent or deposits.

```
                 ┌────────────┐   ┌─────────────┐
  tenants ──────▶│  /web      │   │  /admin     │◀──── staff (2FA)
  owners  ──────▶│  Next.js   │   │  React+Vite │
                 └─────┬──────┘   └──────┬──────┘
                       │  /api/v1 (same-origin proxy / nginx)
                 ┌─────▼──────────────────▼──────┐
                 │  FastAPI (backend/)           │
                 │  · OTP auth · listings/search │
                 │  · orders/payments (Paymob)   │
                 │  · contracts & handovers      │
                 │  · admin API · notifications  │
                 └───┬──────────┬───────────┬────┘
                     │          │           │
              PostgreSQL16   Redis       S3/MinIO
              (+PostGIS)   (cache/ARQ)  (media, PDFs,
                     │      worker       private docs)
                     ▼
              object storage signed URLs
```

## Services

| Component | Path | Stack | Notes |
|---|---|---|---|
| API | `backend/` | FastAPI + SQLAlchemy 2 + Alembic | 74 OpenAPI paths; migrations `0001…0006` |
| Worker | `backend/app/worker.py` | ARQ (Redis) | hourly: ad expiry, Fawry 48h expiry, reminders, auto-moderation, **retention jobs** |
| Public site | `web/` | Next.js 16 App Router, TS, Tailwind 4 | SSR/SEO, RTL ar + en, MapLibre, owner dashboard, **contracts/handovers** |
| Staff console | `admin/` | React 19 + Vite 8 + Tailwind 4 | moderation/finance/super-admin roles, TOTP 2FA |
| Mobile (mini) | `mobile/` | Flutter | contract + handover screens (see `mobile/README.md`) |
| E2E | `e2e/` | Playwright (playwright-core + @sparticuz/chromium) | 7 specs, hermetic stack :8010/:3010/:5180 |

## Key domain rules (backend = source of truth)

- **BR-1..BR-12** (ASSUMPTIONS.md): no commission, 1–4 week ad purchases,
  max 5 running ads/owner, approved proof before first approval, rejected
  listings never charged, webhook idempotency (a duplicate webhook can never
  create a second ad period), monthly prices in EGP, no phone numbers in
  titles/descriptions, listing hidden ≤1h after ad end (hourly job).
- **Contracts (Phase 4A)**: editable Arabic template files
  (`backend/app/contract_templates/*.txt`, DRAFT/lawyer-review banner),
  both parties confirm with a **fresh OTP**; on both confirmations the record
  freezes with a **SHA-256 hash** + timestamps/IPs/device log, an Arabic PDF
  (Amiri + reshaper/bidi, QR → `/verify/{ref}`) is generated, national IDs are
  **Fernet-encrypted at rest** and only ever masked over the API.
- **Handovers (Phase 4B)**: check-in checklist (rooms/items/conditions/meters/
  keys/inventory + photo/video) → both OTP-confirm → immutable hash; check-out
  is created *from* a confirmed check-in with a side-by-side diff; PDF per
  handover.
- **Payments**: Paymob (card/wallet/Fawry) + bank transfer + promo codes;
  MockProvider only for dev/test (`PAYMENT_PROVIDER=mock`). Contract fee is a
  normal order with `kind=contract_fee` — settling it **never** starts an ad
  period.

## Request path hardening

`CommitBeforeSendMiddleware` (commit before response — closes keep-alive
read-your-writes races) → `MetricsMiddleware` (Prometheus) →
`SecurityHeadersMiddleware` (CSP in prod) → CORS → exception handlers.

## Data model highlights

- `orders.kind`: `ad_period` | `contract_fee`
- `listings.ad_priority` / `ad_starts_at`: denormalized sort keys for
  `sort=newest` (maintained by `refresh_ad_rank()` on activate/cancel/expire)
- `contracts.terms_hash`, `confirmations_log`, `fee_order_id`
- `handovers.source_handover_id`, `hash`; `handover_media.media_type/added_by`

# ASSUMPTIONS

Every decision the spec left open, made here so review is easy. Business rules
(BR-1..BR-12) always win — nothing below weakens them.

## Stack & infrastructure

1. **Python**: code targets 3.11+ (runs on the sandbox's 3.11); Docker image and CI use
   **Python 3.12** as specified.
2. **Scheduler**: **ARQ** (allowed by spec: "Celery or ARQ") — one worker container running an
   hourly cron (`app/worker.py`), runs the four spec'd jobs in one bundle.
3. **ORM access**: sync SQLAlchemy 2 sessions with FastAPI `def` endpoints (threaded).
   Async can be introduced later without API changes.
4. **Test database**: tests default to **SQLite** for speed/no-infra; the same suite runs on
   PostgreSQL + PostGIS when `TEST_DATABASE_URL` is set (CI runs both matrices). Business
   logic is dialect-agnostic — no SQLite-only shortcuts in behavior.
5. **`listings.geo`**: the ORM works with portable `latitude`/`longitude` columns; on
   PostgreSQL the migration adds a `geography(Point,4326)` column kept in sync by a trigger,
   plus the spec'd **GiST index**. Bbox search uses indexed lat/lon ranges (equivalent result,
   works on both DBs); `ST_DWithin` is available later for radius queries.
6. **Rate limiting**: OTP-per-phone (5/h) is counted from the DB so it is correct across
   workers. Cheap per-IP / per-user guards (OTP per IP, contact reveals, exact-pin reveals,
   reports, admin logins) use an in-process sliding window — Redis-backed shared limiting is
   deferred (Redis is already in the stack).
7. **Storage**: `STORAGE_BACKEND=local|s3`. Local backend is used in dev/test and serves
   public media through `/api/v1/files/public/...` and private files through **HMAC
   short-lived signed URLs** (`/api/v1/files?...`, 1 h). S3/MinIO backend uses public-bucket
   URLs for listing photos and presigned URLs for documents.
8. **web / mobile / admin directories** are created empty in Phase 1 per the phase plan
   (clients arrive in Phase 3).

## Auth & accounts

9. **Phone format**: only Egyptian mobiles are accepted (`010/011/012/015`, prefixes
   `+20`/`0020`/`0` allowed); stored canonically as `+201XXXXXXXXX`.
10. **OTP delivery**: provider interface with a console implementation (logs the code).
    With `DEBUG=true` the OTP response includes `dev_code` so local flows work without SMS;
    never in prod.
11. **OTP mechanics**: 6 digits, 5 min, max 5 attempts (wrong attempts are persisted even on
    4xx responses). A new request invalidates the *previous* code (verification always uses
    the latest); rows are kept for one hour so the "max 5 requests/hour/number" counter works.
12. **Refresh tokens** are JWTs bound to a device row (`sid`) and hashed at rest; each refresh
    rotates the token. Replaying a stale (already-rotated) refresh token revokes the whole
    device session (reuse detection) — clients must log in again.
13. **Staff sessions**: `kind=staff` JWTs live 8 h. Login always requires email + password +
    TOTP (spec: staff use 2FA). The super admin is seeded from env vars; in non-prod, missing
    envs fall back to obvious dev credentials **with a loud warning**; prod refuses to seed.
14. **Role matrix**: `super_admin` passes every admin route; `moderator` → moderation,
    verification, reports, users (read), dashboard; `finance` → payments, revenue, refunds,
    CSV, dashboard. Plans, promo codes, user ban/`listing_cap` and audit logs are
    `super_admin` only. Every mutating admin action writes `audit_logs` (before/after/ip).
15. **Banning**: banning the account bans the phone (the only login identity). Banned users'
    existing tokens get `403 ACCOUNT_BANNED` on the next request.

## Listings, media & moderation

16. **Editable statuses**: owners edit listings in `draft/rejected/expired/rented` (not while
    `submitted/approved/active` — that would bypass moderation). Media uploads only while
    `draft` or `rejected`.
17. **BR-7 counting**: "active listings" = statuses `draft, submitted, approved, active`.
    `users.listing_cap` (nullable int) is the per-user Super Admin override; default 5.
18. **BR-6 timing**: at **submit** the owner must have uploaded *some* proof (any status);
    at **approve** the owner must have at least one **approved** proof (account-level — one
    approval covers all future listings). Approval returns `409 VERIFICATION_REQUIRED`
    otherwise.
19. **BR-12 enforcement**: title/description are rejected when they contain an Egyptian
    mobile number or any run of ≥11 digits. "Real photos" cannot be proven server-side, so:
    server compresses photos (≤ 1.5 MB JPEG + 400 px thumbnail), computes a 64-bit average
    perceptual hash, and **submit fails on duplicates** (hamming ≤ 6 against the same owner's
    other listings) — plus human moderation.
20. **Media limits**: 3–15 photos required at submit, ≤ 15 media items total per listing,
    input ≤ 12 MB (server recompresses). Videos: MP4/MOV ≤ 50 MB stored as-is; the 60 s
    duration check is delegated to the client in Phase 3.
21. **Preset reject reasons** live in `enums.REJECT_REASONS` (fake photos, phone in
    photos/description, wrong location, misleading price, not for rent, duplicate, broker
    suspected, not owner, other+note).
22. **Reports**: any logged-in user (not the owner), 20 reports/hour/user. When **3 distinct
    users** have open/reviewing reports, the listing moves back to `submitted` — triggered
    **inline immediately** *and* by the hourly sweep (spec defines hourly; inline keeps
    dev/worker-less environments faithful to intent).
23. **Mark rented**: allowed from `approved/active/expired`; it closes running ad periods so
    the listing disappears from search at once.

## Search, privacy & ranking

24. **BR-4 ranking**: `priority_weight DESC, ad start DESC, id DESC` for `newest` (equal
    weights today → effectively newest ad start first). `area` sort = **largest first**
    (spec didn't state a direction). `price_asc/price_desc` as named.
25. **Cursor pagination**: opaque base64url keyset cursors encode the active sort tuple;
    malformed cursors → `400 INVALID_CURSOR`. Default limit 20, max 50.
26. **`available_from` filter**: returns units available **on or before** the requested date
    (a unit with `available_from = NULL` always matches).
27. **`bedrooms`/`bathrooms`/`floor`** are exact-match filters; `amenities` values are
    booleans and the filter matches keys set to `true`.
28. **Approximate map pins (spec: ~150 m circle)**: public responses (search + detail) shift
    the pin by a **deterministic ≤ 80 m offset** derived from the listing id and report
    `accuracy_m = 150`, so the true location stays inside the circle without jumping between
    requests. Logged-in users request the precise pin with `GET /listings/{id}?exact=true`
    (the "show exact location" tap), rate-limited; owners always get exact coordinates.
29. **Public detail**: `404` unless the listing is `active` with a running ad (owner sees
    their own in any status). `view_count` increments only for non-owner public views; stats
    and `status/reject_reason` are owner-only. Owner display name is not exposed publicly
    (phone+name only via the logged-in contact endpoint — BR-11).
30. **Location hierarchy**: governorate + city required, district optional; the API validates
    parent chains (`city ∈ governorate`, `district ∈ city`). Coordinates must lie inside
    loose Egypt bounds (lat 21.5–32, lon 24–37.5); rent 100 – 10,000,000 EGP/month.
31. **`finishing`** uses the enum `not_finished | semi_finished | finished | fully_finished |
    deluxe`.

## Orders, plans, promos (Phase 1 scope)

32. **BR-5 scope**: orders are created only for listings in `approved` — plus
    `active/expired` **that have already been published** (they were approved before;
    otherwise renewal after expiry would be impossible, contradicting BR-3's renew rule).
    `draft/submitted/rejected/rented/removed` → `409 ORDER_NOT_APPROVED`.
33. **Plan selection**: orders use the active plan with the lowest `priority_weight`
    (single "Weekly" plan seeded). Migration `0002` (Phase 2) added `orders.plan_id` so
    every order records which plan priced it; the price snapshot stays in the totals.
34. **Order `expires_at`**: set to `created_at + 48 h` for Fawry at creation (consumed by the
    hourly expiry job). Gateway binding (`gateway`, `gateway_ref`) happens in Phase 2; for
    bank transfers we set `gateway=manual` and generate the unique `AQR-…` reference at
    creation so the checkout page can already show it.
35. **Payment endpoints** (`POST /orders/{id}/bank-receipt`, `POST /payments/webhook`,
    `GET /orders/{id}/receipt`, checkout re-mint, bank-transfer approval, refunds through the
    provider) all landed in Phase 2; the Phase 1 admin payment listing/CSV/revenue endpoints
    were extended in place (filters + breakdowns) without breaking their contract.
36. **Promos (BR-9)**: `percent` (0–100] of the order subtotal or `free_weeks` (whole weeks
    free, capped at ordered weeks); `max_uses=NULL` = unlimited; consumption increments
    `used_count` **at order creation** via one atomic conditional `UPDATE` (no overuse under
    concurrency). Codes are case-insensitive (stored uppercase).
37. **Money**: `Numeric(12,2)` in the DB, floats in JSON; totals always `round(…, 2)`.

## Accounts & data lifecycle

38. **DELETE /me** anonymizes the user (phone → `deleted_{12-hex-digits}` (fits `VARCHAR(20)`; not a valid mobile, so it can never log in), name/email
    cleared, status `deleted`), deletes devices, favorites, pending OTPs and verification
    documents **including their files**, and **keeps** orders/payments/ad periods (financial
    records) still linked to the anonymized owner. Contact reveals for deleted owners return
    `404 OWNER_UNAVAILABLE`.
39. **Verification uploads**: JPEG/PNG/WebP/PDF ≤ 8 MB, stored privately; endpoints return
    **short-lived signed URLs** only (never public listing).
40. **National IDs / contract PII**: the schema stores `contracts.ids_encrypted` as ciphertext
    (encryption key from env in Phase 4); nothing sensitive is ever returned in list APIs.

## Seed data

41. Locations: all **27 governorates**, a main city for every governorate, metro cities
    (Cairo/New Cairo/15 May, Giza/6 Oct/Sheikh Zayed/Hadayek El Ahram, Alexandria/Borg El
    Arab) and **districts for Cairo, Giza and Alexandria** (spec minimum). IDs are
    deterministic (`uuid5`) so seeds are idempotent.
42. Default plan: **Weekly — 500 EGP / 7 days, priority_weight 0, active** (BR-1).
43. `make seed` = spec only. `make seed-demo` additionally creates a verified demo owner with
    3 Active listings (14-day ads), a tenant user, and a `FIRSTAD` 100 % promo (BR-9 example)
    so a fresh stack has content to browse.

## Testing & CI

44. Test OTP codes are read from the console provider's in-memory log; `DEBUG=true` in tests
    also exposes `dev_code`.
45. CI (GitHub Actions): `ruff` + `mypy` (mypy-lite config) + pytest on **SQLite and
    PostgreSQL+PostGIS**; the postgres job runs `alembic upgrade head` first so the migration
    (including the PostGIS trigger/index path) is exercised on every push/PR.
46. Coverage: **92 % overall after Phase 2**, every module under `app/services/*` ≥ 73 %
    (payment orchestration 87 %, Paymob adapter 83 %, receipts 92 %) — spec target kept.

## Payments (Phase 2)

47. **Provider selection**: `PAYMENT_PROVIDER=mock` by default — offline, deterministic, and
    used by the whole test suite; `paymob` in production. The webhook endpoint detects the
    provider from the payload shape (mock: `provider` field; Paymob: `type`+`obj`), never
    from configuration alone.
48. **Paymob** follows the official Accept REST flow (auth token → `/api/ecommerce/orders` →
    `/api/acceptance/payment_keys` for cards; `/api/acceptance/payments/pay` for the
    Vodafone Cash invoice and the Fawry kiosk reference). Every endpoint URL is configurable
    (`PAYMOB_*_URL`, `PAYMOB_IFRAME_URL_TEMPLATE`); callback verification is HMAC-SHA512 over
    the 20 documented ordered fields, delivered as the `?hmac=` query parameter.
    Refunds call `/api/acceptance/void_refund/refund`. **No card data ever touches our
    servers** — only gateway references and transaction ids are stored.
49. **Duplicate pending orders**: a payable fawry/wallet/bank reference blocks any new order
    for the same listing (`409 DUPLICATE_PENDING_ORDER`); an ephemeral pending *card*
    checkout is superseded (marked `failed`) by a new card attempt instead of blocking.
50. **BR-7 at checkout**: a new order is refused when the owner already has `listing_cap`
    (default 5) listings with a running ad and the ordered listing is not among them.
    Renewals of a live listing are always allowed.
51. **Free orders** (100 % percent promo, or `free_weeks ≥ weeks`): settled at creation
    (`status=paid`, `gateway=promo`, txn id `FREE-…`) — the gateway is skipped and the ad
    starts immediately (BR-5 approval still applies).
52. **Webhook pipeline**: HMAC check → parse → locate order by `gateway_ref` →
    `SELECT … FOR UPDATE` → idempotent settle keyed on the unique `payments.gateway_txn_id`
    (duplicates/replays never create a second payment or ad period). Amount mismatches and
    unknown orders are logged and answered `200 ignored` so gateways do not retry-storm;
    `WEBHOOK_IP_ALLOWLIST` optionally restricts source IPs; bad signature → 401.
53. **Money**: `Numeric(12,2)` in the DB; all Phase 2 arithmetic (gateway piasters, refunds,
    revenue sums, ad-period shortening) is `Decimal`; JSON keeps the Phase 1 float shape at
    the API boundary only.
54. **Bank transfers**: receipt is a JPEG/PNG/WebP ≤ 5 MB stored privately; Finance approves
    (payment recorded, ad goes live, owner notified) or rejects with a reason (owner
    re-uploads; the order stays pending and does **not** auto-expire).
55. **Refunds (BR-8)**: full refund cancels the order's ad period and hides the listing once
    no period is running; partial refunds shorten the period proportionally to the refunded
    amount. Gateway-backed payments go through `provider.refund`; manual/bank/promo payments
    are recorded only. Provider refunds are stored in `refunds.gateway_ref` (migration0002).
56. **Receipts**: PDF via ReportLab + `arabic-reshaper` + `python-bidi` with the embedded
    Amiri font (SIL OFL, `backend/app/assets/fonts/`, license included). Generated lazily on
    `GET /orders/{id}/receipt` (owner or staff) and pre-warmed by the worker sweep every
    10 minutes; stored at `receipts/<order_id>.pdf` in object storage.
57. **Consecutive renewals**: a paid renewal for a listing with a running ad **stacks** —
    `starts_at` = the current period's `ends_at`; after expiry (or a refund that ended the
    period) a new purchase starts immediately. BR-4 ordering follows the newest ad start.
58. **Order rate limiting**: `POST /orders` is capped per user
    (`ORDER_RATE_LIMIT_PER_HOUR`, default 30/h) on top of the existing per-IP guards.

## Deferred to later phases (per the spec's own phasing)

59. Phase 3: web/mobile/admin UIs, push notifications (schema + in-app API exist now).
60. Phase 4: contract PDF generator & handover checklists (tables + enums already migrated).
    The contract feature will state it is a **private agreement template** and does not
    replace official registration.

## Stage 3A (web + admin + e2e)

61. **Ad price source of truth**: the Phase-3 spec text mentions “1500 EGP / 1 month” as the
    listing fee example, but **business rules win**: price always comes from the `plans` table
    (seeded Weekly plan = **500 EGP / 7 days**, `len(plans)==1` asserted by tests). No second
    plan was added; checkout multiplies `plan.price_egp × weeks` and the backend re-validates.
62. **Languages**: the public site (`/web`) is Arabic-first (RTL) with a full English
    secondary locale (`/{locale}/…`, hreflang, `x-default=/ar`). The `/admin` console is
    English-only — it is an internal staff tool and the admin API messages/presets are
    English (no admin translation layer invented).
63. **Admin gaps (no backend API — nothing invented)**: (a) **staff CRUD** — the API exposes
    no staff management endpoints, so the Staff page shows the role matrix + per-staff audit
    activity instead; provisioning stays with `STAFF_SUPER_ADMIN_*` env/seed. (b)
    **settings writes** — no settings endpoint exists; the Settings page is a read-only view
    of backend-owned limits and enum presets (`REJECT_REASONS`, report actions). (c) report
    actions are limited to the API's `dismiss | resolve | remove_listing | to_moderation`.
    (d) **“request changes”** maps to *reject with a preset reason + note* (the backend has
    no `changes_requested` status; a rejected listing is editable + resubmittable). (e)
    dashboard **top areas** are derived client-side from the active-listings queue because
    `DashboardOut` has no per-area breakdown. (f) per-listing **favorite counts** are not
    returned by `/me/listings` (only views/contacts/days-left), so the owner dashboard omits
    that column.
64. **E2E stack**: Playwright runs on `playwright-core` + `@sparticuz/chromium` (browser
    CDNs are unreachable in the build sandbox; the binary ships via npm and its Amazon-Linux
    libs are inflated per run because `/tmp` does not persist). The suite is **hermetic**:
    backend `:8010` with a wiped SQLite DB, web `:3010` (isolated `.next-e2e`), admin
    `:5180` — the dev-preview servers (`:8000/:3000/:5173`) are untouched. Seeded super
    admin: `admin@aqar-rent.dev` / `ChangeMeAdmin!2026` + TOTP secret
    `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP` (dev defaults; overridden by env in production).
65. **Wizard specifics**: the map step accepts click-to-pin *and* manual lat/lng inputs
    (Egypt bounds enforced client-side + server-side). Photo **reorder applies while photos
    are staged** (drag + arrow buttons) — the API has no media-reorder endpoint, so the
    final order is fixed at upload time (cover = first uploaded). Client-side compression
    targets ≤ 1.5 MB / 1920 px before upload with per-file progress + retry.

## Phase 4 — contracts, handovers, hardening (4A/4B/4C)

66. **Contract templates** live as editable Arabic `.txt` files under
    `backend/app/contract_templates/` (override with `CONTRACT_TEMPLATE_DIR`)
    — never hard-coded. Each carries the mandated header
    “مسودة — تحتاج مراجعة محامي قبل الاستخدام الإنتاجي” and the UI/PDF state
    *“This is a private agreement template and does not replace official
    registration or notarization.”* No legal claims are made anywhere.
67. **Confirmation = fresh OTP per party** on top of OTP login: `POST
    /auth/otp/request` then `POST /contracts/{id}/confirm {otp_code}`
    (`consume_otp` is shared with login so codes are single-use). Both
    confirmations freeze the record: SHA-256 over the canonical JSON of
    template+terms+parties+encrypted-NIDs, plus `confirmations_log`
    (party, UTC time, IP, user-agent, `otp_verified`).
68. **National IDs**: Fernet (`CONTRACT_NID_KEY`, derived from `SECRET_KEY`
    when unset — dev only). API returns `1234******2345` masks only; full
    values appear solely inside the party-only PDF; logs redact 14-digit runs.
    Rotation notes: `app/core/crypto_service.py`.
69. **Contract fee**: `CONTRACT_FEE_EGP` (default **0**, suggested50) creates a
    normal payable order with `orders.kind=contract_fee`, `weeks=0`. Settling
    it **never activates an ad period** (`mark_order_paid` guards on `kind`).
    The spec's example fee is therefore configurable without touching plans.
70. **Verification page** `/verify/{reference_no}` exposes only
    valid/not-found + creation date + masked party names (public, no auth).
71. **Handover immutability**: check-out may only be created from a
    **confirmed** check-in (structure copied server-side); both parties OTP-
    confirm; `handovers.hash` freezes the payload + media keys. Media uploads
    re-encode images (magic bytes via PIL) and type/size-check videos.
72. **Search at 100k (load-test findings)**: the original `newest` sort used
    correlated subqueries in ORDER BY and timed out; final design denormalizes
    `listings.ad_priority`/`ad_starts_at` (kept in sync by
    `refresh_ad_rank()` on activate/cancel/expire/refund) + composite indexes
    (`0004…0006`). Sequential p95: newest5ms, price17ms, bbox12ms, detail15ms.
    Free-text `q` has a ~1.5s concurrent tail on SQLite — flagged for
    pg_trigram/FTS before relying on text search under load (report).
73. **Backfill migrations are O(n)**: correlated SQL took >10min on100k rows;
    `0005` uses two GROUP BY passes + batched UPDATE (2.7s) and is idempotent
    (SQLite DDL is non-transactional — a killed run can leave columns without
    the stamp).
74. **PostGIS is optional**: `0001` creates the `geo` GiST column only when
    the extension is available (vanilla PostgreSQL still migrates; the ORM/
    search use portable lat/lon either way).
75. **Backup/restore is tested**: `scripts/backup.sh` + `restore.sh`
    (pg_dump custom format) roundtrip-tested against a throwaway PostgreSQL
    (`tests/test_backup_restore.py`), including index + migration version.
76. **Mini Flutter app** (user's choice for this round): `/mobile` contains
    login, contract list/wizard/detail (OTP confirm, PDF share) and handover
    editor (checklist, camera upload, OTP confirm) — **not compiled in this
    sandbox** (no Flutter SDK; `flutter create .` generates platform shells —
    see `mobile/README.md`).
77. **Admin console is English-only** (staff tool); the public site is
    Arabic-first. Consent banner gates the web app (localStorage version
    flag); retention jobs run hourly in the worker.

## Production-hardening round (branch production work, 2026-11-02)

78. **Boot validation is the enforcement point**: `Settings.validate_runtime()`
    refuses to start staging/prod with SQLite, DEBUG=true, weak/known
    SECRET_KEY, console OTP, wildcard CORS, missing webhook/staff secrets;
    prod additionally refuses mock payments, incomplete Paymob keys, http
    SITE_URL and an unset `CONTRACT_NID_KEY`. Compose adds `${VAR:?}` on top.
79. **Rate limiting** uses a Redis ZSET sliding window when Redis is reachable
    (shared across uvicorn workers/hosts) with the previous in-process window
    as dev/test fallback; tests never touch Redis (`app_env=test`).
80. **Undeclared dependencies were a real CI bug**: `cryptography`,
    `prometheus-client` and `qrcode` were used by Phase-4 code but only
    installed manually — declared in `requirements.txt` this round; a clean
    venv reproduces CI (`151 tests collect`).
81. **SMS**: `TwilioOTPProvider` is the production path (E.164, basic-auth,
    errors never leak the code); `console` remains dev/test-only and is
    refused outside dev. Twilio credentials are an external blocker.
82. **Full Flutter client** (Phase3B scope absorbed): `mobile/lib` covers all
    core flows with the same business rules; `flutter analyze/test/build` must
    run on a machine with the SDK (unavailable in this sandbox — measured
    storage.googleapis.com unreachable) — recorded as a go-live item.
83. **CI PostgreSQL job root cause** (exit4) was the undeclared-dependency
    import failure at conftest collection — fixed by item80; steps are split
    (migrate vs test) and failure tails are emitted as annotations.


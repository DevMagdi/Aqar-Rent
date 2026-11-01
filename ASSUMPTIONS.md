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
    (single "Weekly" plan seeded). `orders.plan_id` is not in the given schema; Phase 2 will
    add it when tiers become purchasable.
34. **Order `expires_at`**: set to `created_at + 48 h` for Fawry at creation (consumed by the
    hourly expiry job). Gateway binding (`gateway`, `gateway_ref`) happens in Phase 2; for
    bank transfers we set `gateway=manual` and generate the unique `AQR-…` reference at
    creation so the checkout page can already show it.
35. **Payment endpoints that need a gateway** (`POST /orders/{id}/bank-receipt`,
    `POST /payments/webhook`, `GET /orders/{id}/receipt`, refunds by Finance) are Phase 2;
    the admin refund endpoint and payment listing/CSV/revenue **are** in Phase 1 because the
    spec's admin list requires them — they operate on `payments` rows (created by seed/tests
    until the gateway lands).
36. **Promos (BR-9)**: `percent` (0–100] of the order subtotal or `free_weeks` (whole weeks
    free, capped at ordered weeks); `max_uses=NULL` = unlimited; consumption increments
    `used_count` **at order creation**. Codes are case-insensitive (stored uppercase).
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
46. Coverage: **93 % overall**, every module under `app/services/*` ≥ 70 % (spec target).

## Deferred to later phases (per the spec's own phasing)

47. Phase 2: PaymentProvider adapters (Paymob, mock), Fawry/Vodafone Cash, bank-receipt
    upload, webhook signature/idempotency, PDF receipts, scheduled ad activation on payment.
48. Phase 3: web/mobile/admin UIs, push notifications (schema + in-app API exist now).
49. Phase 4: contract PDF generator & handover checklists (tables + enums already migrated).
    The contract feature will state it is a **private agreement template** and does not
    replace official registration.

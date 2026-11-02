# Decision log — عقار رينت / Aqar Rent (Phase 5)

Every significant decision made in this round, with rationale and the code that
implements it. Decisions are numbered so they can be referenced from the PR,
tests and acceptance criteria.

## D1 — Positioning: broker-optional, not "broker-free only"

We corrected the brand typo `عقار ربنا` → `عقار رينت` across all tracked files
and replaced "broker-free" exclusivity with **"most trusted, transparent,
broker-optional"**. Individuals still list directly with no rent commission;
verified offices are now first-class accounts. Marketing copy never implies a
government check. Code: `README.md`, `web/src/lib/i18n.ts`, static pages,
`backend/app/main.py` API description, `mobile/lib/core/i18n.dart`.

## D2 — Keep the 500 EGP / 7-day ad as the entry point; add layers above it

`plans` table stays the source of truth for the weekly price (BR-1). On top:
`ad_packages` (2/4/8-week discounts + priority), `subscription_plans`
(individual and office audiences), and a one-off premium verification grant.
Prices are seeded idempotently (`seed_growth`) and editable by Super Admin
(`/admin/growth/*`) — clients always read `/pricing`. No price is hard-coded in
web/mobile. `OrderCreateIn.weeks` remains 1..4 for a plain ad; 5..52 weeks is
accepted **only** with an active `package_id`, so BR-2 backward compatibility is
preserved. Code: `models/growth.py`, `services/subscription_service.py`,
`services/order_service.py`, `api/v1/pricing.py`, `api/v1/admin/growth.py`.

## D3 — Platform never holds rent money or deposits

All new revenue is for platform services (ads, packages, subscriptions,
optional verification, contract packages). Commission between an office and an
owner is a private optional record in `leads.commission_egp`; the platform never
collects, settles or sees the money. Copy is repeated in pricing, legal, office
and receipt screens. Subscription activation creates NO listing and NO rent
movement. Code: `growth.py`, `subscription_service.create_subscription_order`,
`payment_service.mark_order_paid`, `receipt_service.py`.

## D4 — Subscriptions reuse the proven Order/Payment pipeline

Rather than a second checkout system, a subscription is `Order.kind =
"subscription"` with `listing_id = NULL`, `plan_id = NULL`,
`subscription_plan_id = <plan>`. It goes through the same Paymob HMAC webhook,
bank-transfer approval, idempotency, refunds, Arabic receipt and audit trail.
`mark_order_paid` activates the subscription instead of an ad period. There is
no auto-charge and no stored card: renewal is a new explicit payment request
(`activation_hint()` says so in both languages). Code: `services/subscription_service.py`, `services/payment_service.py`, `api/v1/subscriptions.py`.

## D5 — Multi-level trust, not a single binary badge

`User.verification_level` is derived from evidence on file: `phone` → `id` →
`ownership` → `premium` (paid, time-limited, staff-granted). The legacy
`verification_status`/`verified_badge` stay for backward compatibility. Public
cards/detail show `trust_level`, `verified_owner`, localized label, office name
and featured flag, computed in ONE batched query (no N+1). Rejections now carry
a **structured, localizable reason code** (`/trust/reject-reasons`) plus a
one-round appeal that reopens the document for re-review. Code:
`services/trust_service.py`, `schemas/growth.py`, `api/v1/trust.py`,
`api/v1/admin/growth.py`, `services/moderation_service.py`, `services/search_service.py`,
`web/src/components/ListingCard.tsx`, `mobile/lib/core/widgets.dart`.

## D6 — Offices are first-class, with CRM-lite and honest commission framing

New tables: `office_profiles`, `office_members`, `leads`, `lead_events`.
Role-based access (`owner`/`manager`/`agent`), seat limits from the effective
subscription (3 free seats for offices so the free tier is usable), invitations
by phone activated on the invitee's first OTP login, per-agent listing
attribution, a lead pipeline with timeline events, and a performance dashboard
(conversion, follow-ups, views, per-agent results). Code:
`models/growth.py`, `services/office_service.py`, `api/v1/offices.py`,
`admin/src/pages/AdminGrowth.tsx`, `web/src/components/OfficeWorkspace.tsx`,
`mobile/lib/features/offices/office_screen.dart`.

## D7 — Contracts are private agreements. No fake official power.

The three Arabic templates (furnished / unfurnished / commercial) were replaced
with full private-agreement clauses (term, rent, deposit, utilities, use,
maintenance, handover, notices, governing law, electronic confirmation, hash,
QR verification). All "DRAFT — lawyer review required" banners were removed
from templates, PDFs, web and mobile. Every surface states clearly: not
notarized, not officially registered, **not an executive instrument**, no
substitute for official registration. We explicitly state that Egypt has no
Saudi-Ejar equivalent and claim no official authority. A clean future seam
(`integrations/registry.py`) returns `unavailable` with honest bilingual copy;
`GET /contracts/{id}/registry-status` exposes it. `Contract` gained
registry columns. Code: `contract_templates/*.txt`, `services/contract_pdf.py`,
`services/contract_service.py`, `integrations/registry.py`,
`api/v1/contracts.py`, `web/src/app/[locale]/terms/page.tsx`,
`web/src/app/verify/[ref]/page.tsx`, `mobile/lib/features/legal/legal_notice.dart`.
**Remaining external sign-off is listed in `docs/legal-notes.md`.**

## D8 — Handover evidence is explicit and comparable

`GET /contracts/{id}/handovers/comparison` now returns room/item condition
deltas, meter consumption differences, suspicious negative deltas, key counts
and media counts per check-in/out pair. Meter readings are validated as
non-negative numeric values. The platform never assesses deposit deductions.
Code: `services/handover_service.py`, `api/v1/contracts.py`.

## D9 — Payment audit, reconciliation and failure alerting

New append-only `payment_events` table with SHA-256 payload hashes. Checkout,
webhook success/duplicate/failure/invalid-signature/amount-mismatch/unknown-order,
settlement, bank approval/rejection and refunds all write events. Prometheus
counters `aqar_webhook_failures_total` and `aqar_payment_failures_total` are
incremented on failure paths. `GET /admin/growth/reconciliation` compares paid
orders, captured payments, webhooks, refunds and total paid. Code:
`services/payment_audit.py`, `services/payment_service.py`,
`api/v1/admin/growth.py`, `core/metrics.py`.

## D10 — Production refuses all mock/console paths; `ENVIRONMENT` alias

`Settings.validate_runtime()` now requires `PAYMENT_PROVIDER=paymob`,
`OTP_PROVIDER=twilio`, an explicit webhook IP allowlist, a real bank account,
`REGISTRY_ADAPTER=none`, HTTPS site, S3 storage, strong secrets and explicit
CORS in `prod`; staging requires Twilio too. The deployment-standard
`ENVIRONMENT=production|staging|development|test` is accepted as an alias and
maps `production → prod` while `APP_ENV` remains canonical. Release Flutter
builds independently refuse HTTP/loopback API, missing Firebase config and
non-production environments. Code: `core/config.py`, `mobile/lib/config.dart`,
`tests/test_production_config.py`, `tests/test_phase5_growth.py`.

## D11 — Mobile: real native shells, feature-first core, offline-aware

Added complete Android + iOS shells (Gradle, manifests, permissions with
justification, adaptive icons, splash, App Links/Universal Links, privacy
manifest), go_router deep links, FCM foreground/tap handling, biometric re-lock,
onboarding, bilingual in-code i18n (no codegen), offline GET cache, compressed
uploads, cached network images, skeletons/empty/error states, and new pricing /
trust / office / legal screens. All production config comes from dart-defines;
release builds fail fast. Code: `mobile/**`, `scripts/mobile-build.sh`,
`scripts/generate-app-links.sh`, `.github/workflows/mobile.yml`, `mobile/README.md`.

**Verification caveat:** the code sandbox has no Flutter SDK and cannot reach
`storage.googleapis.com`, so `flutter analyze/test/build` are executed by CI
with a real SDK; this is an explicit external dependency, not a hidden mock.

## D12 — Documentation and API surface are generated, not hand-maintained

`docs/openapi.json` and the Postman/Bruno collection are regenerated from the
live FastAPI app by `scripts/generate-api-docs.py` (113 paths, 137 requests).
Static web pages now contain full bilingual legal/privacy/about/how-it-works/
content-rules/support copy; the "coming soon" placeholder was deleted.
Acceptance criteria are centralized in `docs/acceptance-criteria.md`, go-live in
`docs/go-live-checklist.md`, and external dependencies in
`docs/external-dependencies.md`.

## D13 — `main` design-system work is merged, not overwritten

While Phase 5 was being built, `main` received the "Mantiq" navy+gold design
system (ADR-034): per-app `tokens.css`, `tokenValues.ts`, IBM Plex Sans Arabic
via `@fontsource`, remapped legacy Tailwind utilities, an owner navy sidebar and
a compliance test (`tokens.test.ts`). Rather than discard it, `origin/main` was
merged into this branch. The four textual conflicts (`README.md`,
`ASSUMPTIONS.md`, `/verify`, `StaticPage`) were resolved by keeping both sides:
Phase 5 product/legal copy and the Mantiq token styling, correct brand name
"عقار رينت", and the full private-agreement legal notice. New Phase 5 surfaces
were then brought into compliance: gold buttons use `bg-gold text-brand-deep`
(never white-on-gold) and normal-size text uses `text-ink` instead of the banned
`text-brand-500/600/700`. Result: `21/21` web vitest tests pass, including all
6 design-system compliance checks. A stale `.next` cache can produce a false CSS
resolution error after such a merge; `rm -rf web/.next` before a fresh build.

## D14 — Flutter CI analyses the committed project, not a regenerated template

The first PR CI run of `.github/workflows/mobile.yml` failed in
`flutter create .` before analysis: current stable Flutter's
`flutter_localizations` requires `intl ^0.20.3`, while the checked-in pubspec
pinned `^0.19.0`; `flutter create` also implicitly ran `pub get`, added a
template `test/widget_test.dart` and Kotlin-DSL Gradle files that conflict with
the committed Groovy Android shell. Fix: pin `intl: ^0.20.3`, do **not**
regenerate the project for `flutter analyze`/`flutter test`, and only on
`workflow_dispatch` release builds call `flutter create --no-pub` to add the
missing Xcode/Gradle-wrapper files, then delete template leftovers. This keeps
one source of truth for native shells and makes the PR quality gate deterministic.


# Acceptance criteria — every major feature

Criteria are testable and mapped to evidence. "CI" means the repository's
automated checks; "device" means a real Android/iOS device or simulator with the
Flutter SDK (see `docs/external-dependencies.md`).

## A. Trust & verification

| # | Criterion | Evidence |
|---|---|---|
| A1 | Four derived levels `phone < id < ownership < premium`; transparent AR/EN labels + badges | `services/trust_service.py`, `test_trust_ladder_badges_appeal_and_premium_grant` |
| A2 | Search cards & detail show trust level, verified flag, office name, featured flag in **one** batched query | `services/search_service.py::_owner_trust`, `web/.../ListingCard.tsx`, `mobile/lib/core/widgets.dart` |
| A3 | Structured rejection reasons are localizable and exposed publicly | `/trust/reject-reasons`, `admin/src/pages/Verifications.tsx` |
| A4 | One appeal per rejected document; staff can reopen or uphold; decision recorded in audit log | `api/v1/trust.py`, `admin/growth.py`, `moderation_service.decide_verification` |
| A5 | Premium requires reviewed ownership evidence and expires | `admin/growth.py::grant_premium`, `trust_service.recompute_level` |
| A6 | Anti-fraud rate limits configurable per hour for uploads, leads, invites, subscriptions | `core/config.py`, `api/v1/me.py`, `offices.py`, `subscriptions.py` |
| A7 | Copy never claims a government check or official title verification | `docs/legal-notes.md`, templates, tests |

## B. Offices / agents

| # | Criterion | Evidence |
|---|---|---|
| B1 | Office profile with branded public page, commercial-register review status | `api/v1/offices.py`, `web/src/app/[locale]/offices/[slug]/page.tsx` |
| B2 | Multi-user team with roles, seat limits, phone invitations activated on first OTP login | `services/office_service.py`, `services/auth_service.py`, `test_office_team_invites_leads_and_dashboard` |
| B3 | Per-listing agent attribution + managed-units view | `Listing.office_id/agent_user_id`, `/offices/{id}/listings` |
| B4 | CRM-lite: lead create, stage transitions, timeline, follow-ups, conversion dashboard | `services/office_service.py::dashboard`, `/offices/{id}/leads*`, `mobile/lib/features/offices` |
| B5 | Non-members get 403 on office data | `test_office_team_invites_leads_and_dashboard` |
| B6 | Commission is private record only, platform never collects it | `leads.commission_egp`, legal/pricing copy, `test` assertions |

## C. Pricing / payments / subscriptions

| # | Criterion | Evidence |
|---|---|---|
| C1 | All prices DB-backed, single `/pricing` source for web + mobile | `services/subscription_service.pricing_catalog`, `scripts/generate-api-docs.py` |
| C2 | Weekly ad + multi-week packages + owner/office subscriptions + priority boosts | `seed_growth`, `api/v1/plans.py`, `/pricing` |
| C3 | Subscription uses real gateway/webhook path, idempotent, no auto-charge | `test_subscription_checkout_settles_idempotently_and_raises_cap` |
| C4 | Paymob HMAC, IP allowlist, unique gateway txn, row lock, refunds, bank approval | `test_payments.py`, `services/payment_service.py` |
| C5 | Append-only audit trail with SHA-256 hashes + daily reconciliation + failure counters | `services/payment_audit.py`, `/admin/growth/reconciliation`, `core/metrics.py` |
| C6 | `ENVIRONMENT=production` refuses mock payments, console OTP, weak secrets, missing allowlist | `core/config.py`, `test_production_config.py`, `test_phase5_growth.py` |
| C7 | Receipts work for subscription orders and state "platform fees only" | `receipt_service.py`, test |

## D. Contracts / handovers / legal clarity

| # | Criterion | Evidence |
|---|---|---|
| D1 | 3 production-grade Arabic private-agreement templates, no draft banners | `contract_templates/*.txt`, `test_contracts.py` |
| D2 | Explicit "not notarised / not registered / not executive instrument / no Ejar equivalent" on PDF, web, mobile, API | `contract_pdf.py`, `StaticSections.tsx`, `legal_notice.dart`, `docs/legal-notes.md` |
| D3 | Dual OTP confirmation + SHA-256 immutability + QR verification page | `test_contracts.py`, `contract_service.py` |
| D4 | Registry seam is honest `unavailable`; prod refuses other adapters | `integrations/registry.py`, `/contracts/{id}/registry-status`, test |
| D5 | Handover media, numeric meter validation, side-by-side diff with consumption & media counts | `handover_service.py`, `/contracts/{id}/handovers/comparison`, `test_handovers.py` |
| D6 | Lawyer sign-off items explicitly listed as external gates | `docs/legal-notes.md` §3 |

## E. Mobile (highest priority)

| # | Criterion | Evidence |
|---|---|---|
| E1 | `flutter analyze --fatal-infos`, `flutter test`, integration smoke pass on a real SDK | `.github/workflows/mobile.yml`, `mobile/test`, `mobile/integration_test` |
| E2 | Signed APK + AAB + IPA build commands from secrets | `scripts/mobile-build.sh`, CI `workflow_dispatch` |
| E3 | Arabic-first RTL + English on every screen | `core/i18n.dart`, `test/core_test.dart` |
| E4 | Onboarding, deep links (universal + custom scheme), FCM foreground/tap, biometric re-lock | `main.dart`, `core/deep_links.dart`, `push_service.dart`, `core/biometrics.dart` |
| E5 | Offline-aware GET cache, skeletons, empty/error states, image caching + compression | `core/cache.dart`, `core/widgets.dart`, `core/media.dart`, `cached_network_image` |
| E6 | Owner + tenant + office + contracts + handovers parity | `mobile/lib/screens/**`, `mobile/lib/features/**` |
| E7 | Native icon/splash, permissions + justification, privacy manifest, App Links files | `mobile/android`, `mobile/ios`, `scripts/generate-app-links.sh` |
| E8 | Release fail-fast on HTTP API / dev env / missing Firebase | `config.dart::assertReleaseConfig`, `test/core_test.dart` |
| E9 | Store screenshot set + 75s demo script | `mobile/docs/demo-script.md` |

## F. Web / admin / platform

| # | Criterion | Evidence |
|---|---|---|
| F1 | Pricing page, office public page, office workspace, trust panel on detail | `web/src/app/[locale]/**`, `web/src/components/**` |
| F2 | Admin: plans/packages CRUD, office queue, appeals, reconciliation, audit trail | `admin/src/pages/AdminGrowth.tsx`, `Shell.tsx`, `App.tsx` |
| F3 | Static pages have complete AR/EN copy, no "coming soon" | `StaticSections.tsx`, `StaticPage.tsx` |
| F4 | `tsc --noEmit` + production build pass for web and admin | local build commands in PR |
| F5 | Backend 162 pytest with pgserver (161 + 1 skip without), ruff, mypy clean; migration 0001→0007 on SQLite and real PostgreSQL | `backend/tests`, `test_backup_restore.py`, CI |
| F6 | OpenAPI + Postman collection regenerated from live app | `scripts/generate-api-docs.py`, `docs/openapi.json` (113 paths) |
| F7 | Mantiq design system: byte-identical token files, zero hex in TS/TSX, no white-on-gold | `web/src/styles/tokens.css`, `admin/src/styles/tokens.css`, `web/src/styles/tokens.test.ts` (6 tests) |
| F8 | Playwright suite lists 10 tests in 8 specs including computed styles/WCAG | `e2e/tests/design-system.spec.ts`, `npx playwright test --list` |
| F9 | No stale draft/coming-soon copy in web, admin, mobile, docs | `docs/decisions.md`, `PRODUCTION_READINESS.md` |

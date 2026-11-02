# Pricing & packaging — sustainable beyond 500 EGP / 7 days

## Problem with the old model

`500 EGP per listing per 7 days` is a great low-friction entry point, but a
marketplace that only sells weekly ads has no recurring revenue, no reason for
a landlord with 10 units to stay, and no offer for real-estate offices that
currently run on WhatsApp + Excel. It also caps average revenue per account.

## The packaging ladder (all prices live in the database)

| Layer | Audience | What they pay for | Why it converts |
|---|---|---|---|
| **Weekly ad** (`plans`) | Every owner | 1 listing × 7 days = 500 EGP | Same simple, trusted entry point — kept unchanged |
| **Multi-week packages** (`ad_packages`) | Owners who want longer exposure | 2 weeks (5% off), 4 weeks (10%), 8 weeks featured (15% + priority) | Lower effective weekly price + higher rank; `weeks` 5..52 requires a package so BR-2 stays intact |
| **Owner Plus / Owner Enterprise** (`subscription_plans`, `individual`) | Landlords with 3+ units | 299–799 EGP/month | 15–50 listing cap, analytics, bulk tools, priority support |
| **Office Starter / Growth / Pro** (`subscription_plans`, `office`) | Agencies & agents | 499–1999 EGP/month | 30–500 listings, 3–50 team seats, branded page, agent attribution, leads pipeline, performance dashboards, optional private commission tracking |
| **Featured / priority boost** | Any lister | Package priority weight | Better rank in `newest` sort; denormalised `ad_priority` recomputed on every ad state change |
| **Premium verification** (optional, staff-reviewed) | Trust-focused owners | One-off grant, time-limited | Highest trust level; requires reviewed ownership documents first — never sold as a government check |
| **Contract packages** | Parties | Existing `contract_fee` order kind | Organised private-agreement PDF + QR + handover evidence |

## Entitlements are centralised

`services/entitlements.py` computes `effective_listing_cap`, `seat_limit`,
`priority_weight` and merged `features` from the user's custom cap and any
active subscription. Both `listing_service.check_listing_cap` (creation) and
`order_service._check_running_ad_cap` (activation) call it, so a subscription
actually raises limits everywhere (and expiry automatically reverts them).
`/me/entitlements` exposes the same data to web/mobile/admin.

## Payment & accounting rules

- Every purchase is an `Order` (`ad_period`, `subscription`, `contract_fee`).
  Subscription orders have `listing_id = NULL` and go through the **same**
  Paymob/bank/refund/HMAC/idempotency/receipt pipeline.
- `activate_subscription` stacks onto an existing active period, never creates
  a second overlapping subscription, and is idempotent under duplicate webhooks.
- No auto-charge, no stored card: renewal is a new explicit payment request.
  `/subscriptions/status` says this in Arabic and English.
- No rent/deposit/commission money ever reaches the platform. Office↔owner
  commission is an optional private `leads.commission_egp` record only.
- Full audit trail + daily reconciliation: `services/payment_audit.py`,
  `/admin/growth/payment-events`, `/admin/growth/reconciliation`.

## Admin plan management

Super Admin can create/patch/deactivate subscription tiers and ad packages at
`/admin/growth/subscription-plans` and `/admin/growth/ad-packages`; the admin
console surfaces are in `admin/src/pages/AdminGrowth.tsx`. Prices are never
edited in code; `/pricing` is the single public source consumed by web and
mobile. `seed_growth()` creates the default catalogue idempotently and does not
overwrite admin price changes on re-seed.

## Acceptance criteria

| # | Criterion | Test / surface |
|---|---|---|
| P1 | Weekly ad unchanged: 500 EGP / 7 days, 1..4 weeks | `tests/test_orders.py`, `/pricing` |
| P2 | >4 weeks rejected without package; 8-week package applies discount + featured rank | `test_phase5_growth.py::test_multiweek_package_order_validates_and_settles` |
| P3 | Subscription checkout settles idempotently, raises cap and features, no second subscription on replay | `test_subscription_checkout_settles_idempotently_and_raises_cap` |
| P4 | Office plan cannot be bought by an individual account | `test_subscription_audience_mismatch_is_rejected` |
| P5 | Admin can create/patch plans & packages, changes appear on `/pricing` | `test_admin_can_manage_packages_and_subscription_plans` |
| P6 | Public pricing page renders DB prices in AR/EN with honest money principles | `web/src/app/[locale]/pricing/page.tsx`, `mobile/lib/features/pricing/pricing_screen.dart` |
| P7 | Reconciliation is consistent after real settlement | `test_payment_audit_reconciliation_and_registry_status` |

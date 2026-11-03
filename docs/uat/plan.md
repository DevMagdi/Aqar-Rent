# UAT test plan & acceptance checklist (Phase 4C #6)

Scope: the FINAL ACCEPTANCE CRITERIA of the Phase-3/4 spec, mapped to the
automated evidence that proves them + the manual steps for the pilot.

## A. Automated evidence (run: `make ci` / GitHub Actions)

| # | Criterion | Evidence | Status |
|---|---|---|---|
| 1 | Owner registers → proof → listing → approval → **pay500 EGP/1 week by all four methods** → live ≤1 min after confirmation (bank: after Finance approval) | `e2e/tests/owner-journey.spec.ts` (register→proof→approve→mock-webhook pay→active), `e2e/tests/contract-handover.spec.ts`, `tests/test_payments.py` (webhook/bank paths), `tests/test_orders.py` (500×1w) | ✅ automated (card/Fawry/Vodafone share the webhook settlement path; bank approval tested in `payments.spec.ts` + `tests/test_payments.py`) |
| 2 | Tenant finds it **by filters and on the map**, calls/WhatsApp **only after login** | `e2e` specs `owner-journey`, `tenant-search` (filter, sort, price-pin, search-this-area, login-gated contact + contact event in owner stats) | ✅ automated |
| 3 | Listing disappears from search ≤1h after ad end | `tests/test_jobs.py` (`end_expired_ad_periods` → Expired + hidden; hourly cron in `app/worker.py`) | ✅ automated (job) + manual cron check in pilot |
| 4 | Rejected listing never charged; failed/duplicate webhook never creates two ad periods | `tests/test_payments.py` (duplicate/replay →1 period), rejected-before-payment flow in orders tests | ✅ automated |
| 5 | Contract PDF + confirmed check-in **and** check-out generated/downloadable by **both parties**, immutable after confirmation | `e2e/tests/contract-handover.spec.ts` (dual OTP, hash, both-party PDFs, PATCH→409), `tests/test_contracts.py`, `tests/test_handovers.py` | ✅ automated |
| 6 | Every staff action in the audit log | `tests/test_admin.py` (approve/reject/… audit rows), `tests/test_privacy_and_ops.py` | ✅ automated |
| 7 | Load-test + security-checklist reports in /docs | `docs/load-test/report.md`, `docs/security/owasp-checklist.md`, `docs/security/threat-model.md`, `docs/security/dependency-report.md` | ✅ done |

## B. Manual UAT script (pilot, ~2h)

1. **Owner happy path** on a real phone: register → upload a real bill →
   submit → approve in admin → pay with **each** method (card, Fawry, Vodafone
   Cash, bank transfer + Finance approval) → confirm the listing is in search
   within 1 minute (bank: within 1 minute of approval).
2. **Contract**: create via web wizard with a second tester as tenant → both
   OTP-confirm → both download the PDF → scan the QR → `/verify/{ref}` shows
   valid → confirm edits are refused afterwards.
3. **Handover**: check-in with photos (bad network — verify retry), both
   confirm, check-out with side-by-side + meter diff, both PDFs.
4. **Tenant**: filter + map search on mobile Chrome, login, call + WhatsApp,
   favorite, report → admin dismisses.
5. **Negative**: reject a listing (owner sees reason, no charge), duplicate
   webhook simulation (`simulate failure` → retry), expired ad (shorten a
   period in staging) disappears ≤1h.
6. **Admin**: every action from §B lands in Audit; bank approval releases the
   ad; refund full/partial behaves per BR-8.
7. **Accessibility spot-check**: keyboard nav, focus rings, RTL on /ar,
   contrast of badges; Lighthouse mobile ≥90 on home + detail.

Sign-off: product + engineering + (legal for contract templates, per
docs/privacy/pdpl-note.md).

---

## Phase 5 UAT scenarios (automated + manual)

1. **Owner Plus**: buy a subscription with a card → webhook → `/me/entitlements`
   raises the cap; create 6+ listings; expire plan → cap returns to 5.
2. **8-week featured package**: checkout with `package_id`, confirm discount and
   featured rank; legacy 5-week request without package returns 422.
3. **Office**: create profile → staff verify → invite agent → agent OTP login →
   lead new→won → dashboard shows conversion 100% → outsider gets 403.
4. **Trust**: upload ID → structured rejection → appeal → staff reopen → approve
   → ownership doc → premium grant → public card shows "مالك موثّق".
5. **Legal**: contract PDF has no draft banner, includes bordered legal notice,
   QR and hash; `/verify/{ref}` and `/contracts/{id}/registry-status` show
   honest "unavailable" copy.
6. **Reconciliation**: after a settlement `/admin/growth/reconciliation` is
   consistent; invalid HMAC and amount mismatch create audit events.
7. **Mobile (device)**: onboarding → Arabic/English toggle → pricing → trust →
   office → deep link → biometric re-lock → offline banner with cached results.
8. **Production boot**: set `ENVIRONMENT=production` with `PAYMENT_PROVIDER=mock`
   and confirm the API refuses to start; release Flutter build fails fast on an
   HTTP API base.

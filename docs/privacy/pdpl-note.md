# Privacy note — Egyptian Personal Data Protection Law (PDPL) — FLAG FOR LEGAL REVIEW

> **This is an engineering note, not legal advice and not a legal claim.**
> It lists what the system actually does with personal data so counsel can
> review it against Law No. 151 of 2020 (and its executive regulations)
> before launch. **A licensed Egyptian lawyer must review this document, the
> contract templates and the terms of service before production use.**

## Data inventory (as built)

| Data | Where | Controls |
|---|---|---|
| Phone (login identity) | `users.phone` | hashed OTP codes; phones redacted in logs (`[PHONE]`) |
| Full name, city, language | `users` | editable/deletable by the user |
| National ID (contracts) | `contracts.ids_encrypted` | Fernet-encrypted at rest; API returns masks only; visible in the PDF to the two parties only; never logged |
| Ownership-proof documents | object storage, private key | signed short-lived URLs; **deleted 90 days after a final decision** unless an open report exists |
| Contract & handover text/PDF | DB + storage | visible only to the two parties; PDFs via authenticated download |
| Contact events (who revealed whose number) | `contact_events` | **deleted after 12 months**; used only for abuse detection & owner stats |
| Notifications | `notifications` | in-app; user can clear |
| Analytics counters | listings.view_count, orders, contact_events | aggregated funnel only (admin), no third-party trackers |

## User rights endpoints (as built)

- **Export**: `GET /api/v1/me/export` — full JSON of profile, listings,
  favorites, orders, notifications, contact events, reports filed,
  verification docs metadata, contracts & handovers.
- **Deletion**: `DELETE /api/v1/me` — anonymizes the account, keeps financial
  records (orders/receipts) as required for accounting (documented in
  ASSUMPTIONS.md).
- **Consent**: first-visit consent banner on the web app (localStorage flag,
  links to the privacy page); privacy/terms/content-rules pages are live.

## Retention jobs (hourly worker)

- verification documents: 90 days after `reviewed_at` (final decision), skipped
  while an open report exists on the owner's listings.
- contact_events: 12 months.
- both are counted in `run_hourly_jobs` (`purged_verification_docs`,
  `purged_contact_events`) and covered by tests
  (`tests/test_privacy_and_ops.py`).

## For counsel to confirm (open items)

1. Lawful-basis wording for OTP login + marketing-free notifications.
2. Cross-border transfer statement (hosting region of production).
3. Retention periods above vs. any sector guidance for rental records.
4. Contract template terms — templates are complete private agreements (no draft
   banner); counsel must still sign off the wording (`docs/legal-notes.md` §3).
5. Data-processing agreements with Paymob/SMS/map providers.

---

## Phase 5 privacy addendum

- **Offices/leads**: tenant phone, name, budget, notes and optional private
  commission values are stored in `leads`/`lead_events` and are visible ONLY to
  active office members. They are part of the user's data export and are deleted
  with the office account. No tenant lead data is public.
- **Trust documents**: structured rejection reason codes + one appeal note are
  retained under the same 90-day purge rule as verification documents.
- **Payment events**: append-only audit records contain order/payment
  identifiers, provider, txn reference, amount and a SHA-256 hash of the
  payload — never card numbers, OTPs, national IDs or raw webhook secrets.
- **Mobile**: tokens in `flutter_secure_storage`; offline cache holds public
  GET responses only (never private documents/PDFs); private verification files
  are opened through short-lived signed URLs and are NOT cached on disk;
  biometrics gate local UI only (no biometric data leaves the device).
- **Still requires lawyer sign-off**: see `docs/legal-notes.md` §3.

# Admin runbook (Phase 4C #6)

Console: `/admin` (email + password + TOTP). Roles: **Moderator**, **Finance**,
**Super Admin** (menu is role-filtered; the API enforces it too).

## 1. Moderation queue — SLA 24h

1. Queue defaults to `submitted`; filter by owner phone.
2. Open **Review** → check photos (real, no watermarks), price (monthly EGP),
   location sanity, no phone numbers in text, not a duplicate.
3. **Approve** → listing goes `approved` (owner must have an approved proof —
   BR-6; if missing the API returns `VERIFICATION_REQUIRED`).
4. **Reject / request changes** → pick a preset reason + optional note. The
   listing returns to `rejected`; the owner edits and resubmits. *Rejected
   listings are never charged* (payment only happens after approval).
5. Every action lands in the **audit log** (Audit page, before/after JSON).

## 2. Verifications

Queue → **View document** (short-lived signed URL — never download to disk on
shared machines) → Approve (unlocks first listing approval) or Reject with a
reason. Documents are auto-purged 90 days after a final decision (retention
job) unless an open report exists on that owner's listings.

## 3. Reports & bans

- Reports queue: **Dismiss** (no violation) / **Resolve** (note) /
  **Send to moderation** (auto also at 3 distinct reporters) /
  **Remove listing** (immediate takedown).
- Users page: search → **Ban account** (blocks login/verification instantly —
  API returns `ACCOUNT_BANNED`), **Unban**, raise listing cap.
- All actions are audited.

## 4. Refunds (Finance)

Payments page → row **Refund** → amount empty = full refund (BR-8: cancels the
ad period, hides the listing when no period remains) or a partial amount
(pro-rates the period). Gateway refunds go through Paymob; bank/manual payments
are recorded only. Refunded orders show as `refunded` in receipts/exports.

## 5. Bank-transfer approvals (Finance)

Bank transfers queue → **Review** receipt (signed URL) → verify the transfer
reference against the bank statement → **Approve** (order settles paid, ad goes
live, owner notified) or **Reject** with a reason (owner re-uploads; order stays
pending). Never approve without matching the reference + amount.

## 6. Payments & promo

- Dashboard shows revenue (paid − refunded) and the conversion funnel.
- Plans/promos (Super Admin): plan changes affect **new** orders only (price
  snapshot in `subtotal`). `FIRSTAD` = first ad free (100% off, seeded, 1000
  uses) — hand out for the pilot.

## 7. Hourly jobs & alerts

Worker runs hourly: ad expiry (listing → Expired, hidden from search ≤1h after
period end), Fawry/wallet order expiry (48h), “ad ends in 2 days” reminders,
auto-moderation at 3 reports, **verification-doc purge (90d)**,
**contact-event purge (12 months)**.

Alert on (see `GET /metrics`):
- `rate(aqar_webhook_failures_total[5m]) > 0` sustained → gateway/HMAC issue
- `rate(aqar_payment_failures_total[5m])` spike → checkout regression
- `rate(aqar_job_failures_total[5m]) > 0` → worker failing (jobs are
  isolated: one failure never stops the rest; failed job logs `job X failed`)
- `aqar_http_request_duration_seconds` search p95 > 0.6 s → see
  docs/load-test/report.md

## 8. Daily/weekly ops

- Backups: `scripts/backup.sh` (see docs/backup-restore.md) — daily cron.
- Check `/ready` and `/health` from the load balancer (readiness = DB up).
- Logs are PII-redacted (`[PHONE]`, `[NID]`, `[TOKEN]`, `[SECRET]`).

---

## Phase 5 runbook additions

- **Payment reconciliation**: finance reviews `/admin/growth/reconciliation`
  daily; `consistent: false` or non-empty `mismatches` → freeze payouts and
  inspect `/admin/growth/payment-events`. `aqar_webhook_failures_total` and
  `aqar_payment_failures_total` are the alerting counters.
- **Appeals**: moderator queue `/admin/growth/appeals`; "Reopen review" puts the
  document back in the pending verification queue; "Uphold rejection" records
  the decision in the audit log. Only one appeal per document.
- **Offices**: `/admin/growth/offices` verifies commercial-register data;
  "Request info" returns the office to `pending` with a note. Offices get 3 free
  seats; paid plans raise caps/seats/features.
- **Premium verification**: only grant after ownership documents are approved;
  the grant is time-limited and audit-logged.
- **Subscription incidents**: duplicate webhooks must NOT create a second
  subscription; expiry is handled by the hourly job; cancellation stops auto
  renewal but keeps benefits until the paid end date.

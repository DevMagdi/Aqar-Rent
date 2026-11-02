# Threat model — broker impersonation & fake-listing abuse (Phase 4C #1)

Scope: the two abuse patterns that would kill a broker-free marketplace.
(No legal claims — fraud handling follows Egyptian law as advised by counsel.)

## T1 — Broker impersonation (pretends to be an owner)

**Assets**: listing authenticity, tenant trust, contact channel.
**Abuse**: an agency employee or middleman posts listings they don't own and
harvests tenant phone numbers / charges “viewing fees” off-platform.

Controls (as built):
1. **Ownership proof before first approval (BR-6)** — electricity bill /
   water bill / contract / ID authorization, reviewed by a human in the
   verifications queue (signed-URL viewer, never re-shared), approved proof is
   required before *any* listing approval (`approve_listing` →
   `VERIFICATION_REQUIRED`).
2. **Preset reject reasons** include `broker_suspected` + `not_owner`; a
   rejected listing cannot be charged (payment only exists post-approval).
3. **Content rules (BR-12)**: phone numbers in title/description are rejected
   at submit (`validate_content_rules`) — removes the classic off-platform
   redirect; photos with visible phone numbers/watermarks are a preset reject.
4. **Auto-moderation**: 3 distinct reporters → listing forced back to
   moderation (hourly job).
5. **Ban**: users can be banned (login blocked with `ACCOUNT_BANNED`),
   repeated broker rejects are visible per owner in the moderation search.
6. **Audit**: every staff action is logged with before/after (accountability
   on approvals).

Residual risk: a determined broker with a stolen bill. Mitigations to add
post-launch: document-forensics service, owner-IP consistency scoring — flagged
for Phase 5.

## T2 — Fake listings (phantom inventory / phishing)

**Assets**: tenant safety, search integrity, brand.
**Abuse**: stock photos of non-existent units; deposits collected off-platform;
location spoofing.

Controls (as built):
1. **Human moderation SLA 24h** (runbook §1) with photo/location sanity checks.
2. **Perceptual-hash duplicate detection** — copied photos across the same
   owner's listings are rejected at submit (and one real-photo per unit is
   enforced by the reviewer).
3. **Approximate public coordinates** (150 m fuzzing, `approx_point`) — exact
   pin only after login, rate-limited (`exact:{user}` 120/h); prevents
   scammers from pinpointing units they don't own.
4. **Reports pipeline** with preset reasons, takedown action (`remove_listing`
   hides immediately), auto-moderation at 3 reports.
5. **Ad must be paid & approved to appear** (BR-3: only running ad periods are
   searchable) — a fake listing costs money per week, raising abuse cost.
6. **Listing expiry ≤1h** after payment stops (hourly job) — no zombie ads.

Residual risk: paid fake listings by a mule account. Mitigations to add:
refund-withhold policy on proven fakes (needs legal review), image
reverse-search at moderation time — flagged for Phase 5.

## Cross-cutting

- Enumeration: unknown contracts/handovers return404 uniformly; verification
  page exposes validity + date + masked names only.
- Data harvesting: contact reveals are authenticated, logged as
  contact events and rate-limited (30/h/user).
- Payment fraud: HMAC-verified idempotent webhooks — a replayed/duplicate
  webhook can never create a second ad period (tested).

---

## Phase 5 threat-model additions

| Threat | Mitigation |
|---|---|
| Fake "verified owner" claims | Derived trust levels from actual approved docs; transparent public labels; premium requires ownership evidence; no government-check claim |
| Office impersonation / fake agencies | Commercial-register field + staff review queue, audit-logged decisions, public verification status |
| Team privilege escalation | `require_office_access(manager=True)` on every mutating team/office route; owner seat immutable; invites activated only on OTP login |
| Lead/CRM scraping | Per-user configurable rate limits, office-scoped queries, 403 for non-members |
| Subscription/plan tampering | Prices from DB, audience validation, plan activation only on paid webhook, idempotent under replay, audit trail |
| Payment repudiation | Append-only SHA-256 event chain, reconciliation report, failure counters and signed receipts |
| Registry confusion / legal fraud | `NoOpRegistryAdapter` returns `unavailable`; prod refuses any other adapter; explicit private-agreement copy everywhere |
| Mobile release misconfiguration | `AppConfig.assertReleaseConfig()` refuses HTTP/loopback API, dev environment, missing Firebase and HTTP tiles before `runApp()` |

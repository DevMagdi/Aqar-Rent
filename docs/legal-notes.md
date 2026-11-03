# Legal notes & remaining external sign-off — عقار رينت

**Status of code:** all product-facing legal framing is implemented, honest and
bilingual. **Status of law:** a licensed Egyptian lawyer must still sign off the
template wording below before public launch. This document separates what the
platform does from what only an external legal professional can authorise.

## 1. What the platform is (precise, non-negotiable copy)

- The three lease templates are **private agreements** (`اتفاق خاص`) between the
  owner/landlord and the tenant, electronically confirmed by two independent
  OTP codes (one per party), with a SHA-256 hash of the final terms, a
  professionally laid-out Arabic PDF (Amiri font, reshaping/bidi), a reference
  number and a QR code pointing at `/verify/{ref}`.
- They are **not** notarised, **not** registered with any government body,
  **not** executive instruments (`ليست سندات تنفيذية`), and **not** a substitute
  for official registration/notarisation or any procedure required by law.
- **Egypt has no official digital rental registry equivalent to Saudi Ejar.**
  The platform claims no official or executive authority, does not submit to a
  registry, and does not "verify title" in the legal sense. The future seam
  `OfficialRegistryAdapter` / `NoOpRegistryAdapter` returns `unavailable` with
  bilingual explanatory copy (`GET /contracts/{id}/registry-status`).
- Verification levels (phone → identity → ownership documents → optional
  premium) mean **our team reviewed documents**, not a government check.
- The platform is a technology provider, not a brokerage, not a party to the
  lease, not an escrow. It never collects or holds rent, deposits, rent
  commission, or office↔owner commission. Any commission is a private record
  between an office and an owner, recorded optionally in the lead pipeline.
- Value delivered: organised records, dual confirmation, an immutable hash,
  a QR-verifiable PDF, handover evidence (photos, meter readings, side-by-side
  comparison) and a transparent audit trail. Verification of a reference proves
  record existence and hash integrity **only**.

## 2. What was implemented in this round

| Area | File(s) | Result |
|---|---|---|
| Templates | `backend/app/contract_templates/*.txt` | 3 full Arabic private-agreement leases (residential furnished / unfurnished / commercial) with 16 clauses each, no "draft" banner |
| PDF | `backend/app/services/contract_pdf.py` | branded header, bordered legal notice, clause styling, confirmation log table, SHA-256 fingerprint, QR + verification caveat, page furniture |
| API | `backend/app/api/v1/contracts.py` | `/contracts/{id}/registry-status`, `/contracts/{id}/handovers/comparison` |
| Registry seam | `backend/app/integrations/registry.py` | `OfficialRegistryAdapter` protocol + `NoOpRegistryAdapter` returning `unavailable` |
| Web | `web/src/app/[locale]/terms/page.tsx`, `privacy/page.tsx`, `verify/[ref]/page.tsx`, `components/StaticSections.tsx`, `StaticPage.tsx` | full bilingual legal/privacy sections; placeholder removed |
| Mobile | `mobile/lib/features/legal/legal_notice.dart`, `features/trust`, `main.dart` | same wording, no mock legal claims |
| Tests | `backend/tests/test_contracts.py`, `test_phase5_growth.py` | assert no draft banner, explicit "not executive instrument", registry honesty |

## 3. Items that STILL require external Egyptian lawyer sign-off

These cannot be closed by code. They are acceptance gates for public launch.

1. **Clause-by-clause review** of the three Arabic templates against the
   Egyptian Civil Code and current rental legislation, especially: annual
   increase wording, deposit refund period, termination/eviction notice,
   commercial activity licensing, and subletting/assignment restrictions.
2. **Evidentiary weight of electronic confirmation**: confirm that a
   dual-OTP confirmation log (party, UTC time, IP, device) plus a SHA-256 hash
   is an acceptable evidentiary record between private parties, and specify any
   extra wording/consent required (e.g. explicit e-signature consent text).
3. **Personal-data / national-ID handling**: confirm that encrypted NIDs,
   masked display, 90-day document purging and the public verification page
   (which reveals no names/NIDs) comply with the Egyptian Personal Data
   Protection Law and any implementing regulations (see
   `docs/privacy/pdpl-note.md`).
4. **Commercial register / tax representation**: confirm the office
   verification wording ("commercial register data reviewed by our team") does
   not imply a government check, and approve the tax/commercial-registration
   data required on invoices and receipts.
5. **Furnished inventory & deposit deductions**: approve the wording that the
   platform never assesses or collects deductions and that the side-by-side
   comparison is evidence only.
6. **Marketing copy review**: Terms, Privacy, About, How it works, pricing and
   store listing text — especially "most trusted", "verified owner",
   "broker-optional", "no executive instrument", "no Ejar equivalent" — for
   consumer-protection/advertising compliance.
7. **Official-registry future integration**: if an official Egyptian digital
   rental registry is introduced, legal review of the adapter contract,
   data-sharing agreement and any required licence precedes enabling it.
   `REGISTRY_ADAPTER` must remain `none` until then (production boot enforces).

## 4. Launch gate

- [ ] Egyptian lawyer-of-record engaged and written opinion received
- [ ] Template revisions (if any) applied via `CONTRACT_TEMPLATE_DIR` (no code
      redeploy needed) and PDF re-tested
- [ ] Terms & Privacy updated from the opinion; version/date recorded
- [ ] `docs/go-live-checklist.md` legal row signed off
- [ ] Store privacy labels + in-app permission text reviewed with counsel

**Do not** describe contracts as "registered", "notarised", "official" or
"executive" anywhere in UI, marketing, PDFs or API descriptions. This is a
hard product constraint, enforced by tests and the production config check.

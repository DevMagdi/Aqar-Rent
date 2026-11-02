# Launch checklist — عقار رينت

Authoritative ordered gate list: **`docs/go-live-checklist.md`**. This file keeps
the pilot rollout plan and the store-submission specifics.

## Pilot (week 1) — 1–2 districts

- [ ] Pick districts (suggested: **Maadi** + **Dokki** — seeded demo content
      targets them; verify real inventory first).
- [ ] All six static pages now contain complete, bilingual, reviewed copy
      (`web/src/components/StaticSections.tsx`); only the lawyer's final opinion
      can change wording — no placeholder text remains.
- [ ] Promo **FIRSTAD** active (first ad free, seeded `max_uses=1000`) —
      share only with pilot owners.
- [ ] Office verification queue staffed; review commercial-register data within
      24h; test one invite → first OTP login → lead → won flow end to end.
- [ ] Trust queue staffed; test structured rejection → appeal → reopen.
- [ ] Pricing published on `/ar/pricing`, `/en/pricing` and in the mobile app;
      Super Admin verifies the DB prices match the published offer.
- [ ] Analytics reviewed daily: listing views, contact clicks, orders,
      subscriptions, office dashboard conversion, funnel endpoint.
- [ ] Reconciliation report checked daily (`/admin/growth/reconciliation`).
- [ ] Support inbox staffed; moderation SLA 24h (`docs/runbook.md`).
- [ ] Daily backup cron + one restore drill (`docs/backup-restore.md`).

## Store submission

- [ ] `scripts/mobile-build.sh` produces signed APK / AAB / IPA from CI secrets
- [ ] `scripts/generate-app-links.sh` writes verified association files with the
      REAL Play app-signing SHA-256 and Apple Team ID; served over HTTPS
- [ ] Screenshots + demo video captured per `mobile/docs/demo-script.md`
- [ ] Privacy labels / Data Safety reviewed against
      `mobile/ios/Runner/PrivacyInfo.xcprivacy`, `Info.plist`, Android
      permissions and `docs/privacy/pdpl-note.md`
- [ ] Store description contains no official-registry/notarisation claim and
      states "private agreement, not an executive instrument"
- [ ] `ENVIRONMENT=production` + HTTPS API + production tile host + Firebase
      defines; release fail-fast verified by CI

## Go-live blockers (must clear before public launch)

- [ ] **Paymob live keys** + real 1-EGP capture & refund + webhook IP allowlist
- [ ] **Twilio / approved Egyptian SMS sender** with a real OTP test
- [ ] **Egyptian lawyer final sign-off** (`docs/legal-notes.md` §3) — templates
      are complete private agreements, NOT drafts; this is wording sign-off
- [ ] **Tax / commercial-registration data** for invoices, receipts and bank
      transfer instructions
- [ ] **Production map-tile host** (`MAP_TILES_URL`, `NEXT_PUBLIC_MAP_TILES_URL`)
- [ ] **Apple / Google / Firebase accounts** and signed release builds
- [ ] **Flutter CI green** (`analyze`, `test`, integration, APK/AAB/IPA)
- [ ] **PostgreSQL migration rehearsal** (`0001→0007`) on a staging clone
- [ ] **Domain association files** live with real signing fingerprints

See `docs/external-dependencies.md` for owners/actions and
`docs/go-live-checklist.md` for the full ordered gate list.

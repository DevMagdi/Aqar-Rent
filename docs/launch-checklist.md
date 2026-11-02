# Launch checklist (Phase 4C #6)

## Pilot (week 1) — 1–2 districts only

- [ ] Pick districts (suggested: **Maadi** + **Dokki** — seeded demo content
      already targets them; verify real inventory first).
- [ ] Seed content pages filled with real copy (about/how-it-works/terms/
      privacy/content-rules/support are live templates — replace the
      placeholder paragraphs).
- [ ] Promo **FIRSTAD** active (first ad free, seeded `max_uses=1000`) —
      share only with pilot owners.
- [ ] Analytics events reviewed daily: listing views (`view_count`),
      contact clicks (`contact_events`), orders (`orders`), funnel
      (`/admin` → Conversion funnel card). No third-party trackers — all
      first-party counters.
- [ ] Support inbox staffed; moderation SLA 24h (docs/runbook.md).
- [ ] Daily backup cron + one restore drill (docs/backup-restore.md).

## Go-live blockers (must clear before public launch)

- [ ] **Payment gateway live keys** — Paymob API key/integration/HMAC in env
      (`PAYMENT_PROVIDER=paymob`); verify with a real 1-EGP capture + refund.
- [ ] **Lawyer review** of the three contract templates + terms/privacy
      (docs/privacy/pdpl-note.md open items) — templates currently scream
      “DRAFT — requires lawyer review”.
- [ ] **Tax / commercial registration** data for invoices & the bank account
      shown at checkout (bank_name/account are env-configurable today).
- [ ] **Map provider key** if leaving OSM tiles (`NEXT_PUBLIC_MAP_TILES_URL`)
      — OSM tile usage policy requires a production tile host.
- [ ] **SMS provider** for OTP in production (`OTP_PROVIDER=console` is dev
      only) + WhatsApp Business for notifications (Phase 3B delivery).
- [ ] **App Store / Play Store accounts** (see below) for the Flutter app.
- [ ] Sentry DSN + alert rules (docs/runbook.md §7).

## App Store / Play Store submission (Flutter mini app)

- [ ] Apple Developer Program ($99/yr) + Google Play Console ($25 one-time)
      accounts created; org verification for Egypt.
- [ ] `mobile/`: run `flutter create .` to generate `android/`/`ios/` shells
      → set bundle id (`com.aqarrent.app`), signing certs, API base URL via
      `--dart-define=API_BASE=https://api…`.
- [ ] Privacy labels: account data + contacts-free; link the privacy policy
      URL (web `/ar/privacy`).
- [ ] Screenshots (Arabic RTL), content rating questionnaire, data-safety
      form (matches docs/privacy/pdpl-note.md).
- [ ] Store listing copy in Arabic (+ English subtitle).
- [ ] TestFlight/internal-testing track → the UAT plan §B on real devices
      (Android 8+/iOS 15+).

## Post-launch monitoring (first week)

- [ ] p95 search <600ms (docs/load-test/report.md baseline), webhook failure
      rate =0, job failures =0 (Prometheus alerts).
- [ ] Moderation queue age <24h; bank approvals <12h.
- [ ] Funnel: registrations → submitted → approved → paid (watch drop-offs).

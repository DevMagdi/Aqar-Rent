# Remaining external dependencies (cannot be solved in code)

Everything that can be implemented in this repository **is implemented**:
working backend, web, admin and mobile source, migrations, tests, docs, CI,
legal framing and configuration gates. The items below require accounts,
credentials, hardware or a licensed professional outside the codebase. They are
go-live blockers, not unfinished features.

| # | Dependency | Why code cannot provide it | Owner / action |
|---|---|---|---|
| X1 | **Egyptian lawyer final sign-off** | Legal opinion on the three lease templates, e-signature evidentiary weight, PDPL compliance, commercial/tax wording, marketing claims | Engage lawyer-of-record; see `docs/legal-notes.md` §3; record written opinion + version/date |
| X2 | **Live Paymob account & keys** | Real card/wallet/Fawry acquiring, HMAC secret, integration IDs, IP ranges for the webhook allowlist, live 1-EGP capture + refund test | Merchant onboarding; set `PAYMENT_PROVIDER=paymob`, `PAYMOB_*`, `WEBHOOK_IP_ALLOWLIST` |
| X3 | **Live SMS account (Twilio or equivalent Egyptian A6 sender)** | Real OTP delivery, sender ID registration, throughput limits | Set `OTP_PROVIDER=twilio`, `TWILIO_*`; validate an Egyptian number end to end |
| X4 | **Apple Developer + Google Play Console accounts** | App Store / Play upload, signing certificates, store review, Data Safety & privacy labels | Create `com.aqarrent.app`, upload keystore, distribution certificate + provisioning profile |
| X5 | **Firebase project / APNs / FCM** | Real push tokens and delivery; `google-services.json`, `GoogleService-Info.plist`, `FIREBASE_*` dart-defines | Firebase console + Apple APNs key; inject from CI secrets; never commit config files |
| X6 | **Flutter SDK + macOS build machine** | `flutter analyze/test/build` and IPA require the SDK (blocked in this sandbox: `storage.googleapis.com` unreachable) and Xcode for iOS | CI workflow installs Flutter stable on Ubuntu + macOS 15 and runs all gates |
| X7 | **Production map-tile host** | OSM public tiles are not licensed for production traffic; mobile/web need `MAP_TILES_URL` | Contract a tile provider (MapTiler / self-hosted) and set the HTTPS template at build time |
| X8 | **Tax / commercial-registration data** | Invoice/receipt legal fields, bank transfer instructions and office verification claims | Provide legal entity name, tax ID, commercial register number, bank account; set env vars |
| X9 | **Domain + HTTPS + association files** | Verified App Links / Universal Links need `/.well-known/assetlinks.json` with the real Play signing SHA-256 and `apple-app-site-association` with the real Team ID | Run `scripts/generate-app-links.sh` with real values; serve over HTTPS from `aqarrent.app` |
| X10 | **Production infrastructure secrets** | PostgreSQL+PostGIS, Redis, S3, strong `SECRET_KEY`, `CONTRACT_NID_KEY`, Sentry DSN, staff TOTP/password | Provision managed services; store in the secret manager; `Settings.validate_runtime()` refuses weak values |
| X11 | **Store screenshots & demo video capture** | Binary assets require a built app on real devices/simulators | Follow `mobile/docs/demo-script.md`; attach to store listing and release PR |
| X12 | **Real office/owner commercial agreements** | Optional commission terms between offices and owners are private contracts | Business/legal team; the platform only stores an optional numeric record |

## What is NOT blocked

- The code paths for all of the above are real: no mock provider is reachable
  when `ENVIRONMENT=production`, and the app refuses to boot on a bad setup.
- Tests cover the behaviour with in-memory dev providers; production
  credentials only change the provider implementation, never the flow.
- Legal templates are complete private agreements; lawyer review is a sign-off
  gate on wording, not a missing feature.
- Mobile native shells, CI and build scripts are committed; only the SDK and
  signing material are external.

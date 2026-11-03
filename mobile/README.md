# عقار رينت · Aqar Rent — Flutter app (production, Android + iOS)

Arabic-first, RTL-correct, bilingual mobile client for Egypt's most trusted
rental platform. Owner, tenant **and real-estate office** journeys are complete:
search & map, cached images, trust badges, weekly ads / packages / subscriptions,
OTP login, verification + appeals, contracts (private agreements) & handovers,
push notifications, deep links, biometric re-lock, onboarding and offline-aware
screens. There is **no mock production path**: dev-only helpers are gated by
`ENVIRONMENT`, and a release build refuses to boot without real HTTPS API,
production tile host and Firebase configuration.

## 1. Architecture (feature-first + clean layers)

```
mobile/
├── android/                    full Gradle shell, permissions, App Links, splash, adaptive icon
├── ios/                        Info.plist, entitlements, privacy manifest, AppDelegate, icon set
├── assets/brand/               generated launcher/splash artwork (1024px source)
├── lib/
│   ├── main.dart               app entry, go_router, locale, biometric lock, offline banner
│   ├── config.dart             --dart-define config + release fail-fast validation
│   ├── push_service.dart       real FCM (permission, token, foreground, tap routing)
│   ├── api/api_client.dart     Dio + secure storage + single-flight refresh + offline cache
│   ├── core/
│   │   ├── i18n.dart           Arabic-first / English dictionary (no codegen)
│   │   ├── theme.dart          Material 3 light/dark brand theme
│   │   ├── cache.dart          TTL JSON cache for GET fallback
│   │   ├── connectivity.dart   connectivity stream → offline banner
│   │   ├── widgets.dart        skeletons, empty/error states, trust badges, AsyncView
│   │   ├── deep_links.dart     universal/app links → go_router routes
│   │   ├── biometrics.dart     local_auth re-lock gate
│   │   └── media.dart          image compression before upload (mid-range devices)
│   ├── features/
│   │   ├── onboarding/         3-page first-run flow
│   │   ├── pricing/            DB-driven weekly ad, packages, owner/office plans
│   │   ├── trust/              multi-level badges + entitlements
│   │   ├── offices/            office profile, team invites, CRM-lite, dashboard
│   │   └── legal/              honest private-agreement notice
│   ├── models/models.dart      DTOs mirroring OpenAPI
│   └── screens/                feature UI (search, map, owner, contracts, handovers…)
├── test/                       unit + widget tests
└── integration_test/           cold-start E2E smoke
```

**Layer rule:** UI (`screens`/`features`) → `ApiClient` (network/cache) →
backend. `core/` holds cross-cutting concerns only; no widget calls the backend
directly. All prices, trust levels, office/lead data and legal copy come from
the API — there is no duplicated price list or hard-coded plan.

## 2. Local development

Flutter **3.35+ / Dart 3.9+** required (CI uses the current stable channel).

```bash
cd mobile
# One-time (only for a real device/store build): generate the Xcode project and
# Gradle wrapper files that are not committed. --no-pub avoids an implicit
# `pub get` before the project is complete; then remove template leftovers that
# conflict with our Groovy Android shell and our own Dart tests.
flutter create . --org com.aqarrent --platforms android,ios --project-name aqar_rent_mobile --no-pub
rm -f android/settings.gradle.kts android/build.gradle.kts android/app/build.gradle.kts \
      android/*.iml *.iml test/widget_test.dart
rm -rf .idea android/app/src/main/kotlin/com/aqarrent/aqar_rent_mobile
flutter pub get
flutter run \
  --dart-define=ENVIRONMENT=dev \
  --dart-define=API_BASE=http://10.0.2.2:8000 \
  --dart-define=MAP_TILES_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
```

Quality gates (must all pass before a store build):

```bash
# SDK-free consistency checks (also run in CI): syntax, imports, i18n keys,
# go_router routes and API paths against the generated OpenAPI document.
pip install tree-sitter tree_sitter_dart && python ../scripts/check_mobile.py
flutter analyze --fatal-infos
flutter test --coverage
flutter test integration_test/app_test.dart -d <device-id>
```

Run the backend first (`make dev` in the repo root) and seed it
(`python -m app.services.seed_service` / `make seed`) so `/pricing`,
`/offices/me` and `/me/trust` return real data.

## 3. Production configuration (ALL required)

| dart-define | Example | Why |
|---|---|---|
| `ENVIRONMENT` | `production` | release builds reject anything else |
| `API_BASE` | `https://api.aqarrent.app` | HTTPS only; loopback refused |
| `MAP_TILES_URL` | `https://tiles.aqarrent.app/{z}/{x}/{y}.png` | licensed production tile host |
| `DEEP_LINK_HOST` | `aqarrent.app` | App Links / Universal Links host |
| `FIREBASE_API_KEY`, `FIREBASE_APP_ID`, `FIREBASE_SENDER_ID`, `FIREBASE_PROJECT_ID` | from Firebase console | real FCM; no console/mock OTP |
| `FIREBASE_IOS_BUNDLE_ID` | `com.aqarrent.app` | iOS Firebase options |

`AppConfig.assertReleaseConfig()` runs **before** `runApp()` in release mode and
throws with a precise list of problems if any value is missing, HTTP, a loopback
address or a non-production environment. That check is covered by unit tests and
is the mobile equivalent of the backend's `validate_runtime()`.

### Firebase / native files (from CI secrets, never committed)

```bash
# Android (optional when using manual FirebaseOptions, recommended for FCM)
printf '%s' "$FIREBASE_GOOGLE_SERVICES_JSON" > android/app/google-services.json
# iOS (for APNs / Analytics)
printf '%s' "$GOOGLE_SERVICE_INFO_PLIST_BASE64" | base64 -d > ios/Runner/GoogleService-Info.plist
```

The Android Gradle build applies `com.google.gms.google-services` **only when**
the file exists. `Firebase.initializeApp(options: …)` uses the dart-defines so
the app still boots with manual configuration.

### App Links / Universal Links

```bash
ANDROID_SHA256_FINGERPRINT=<Play app-signing SHA-256> \
APPLE_TEAM_ID=<team-id> \
IOS_BUNDLE_ID=com.aqarrent.app \
DEEP_LINK_HOST=aqarrent.app \
./scripts/generate-app-links.sh
```

This writes `web/public/.well-known/assetlinks.json` and
`apple-app-site-association` with **real** signing data. Serve them over HTTPS
with `application/json` / no redirects from the same host before release.
Verified links: `https://aqarrent.app/ar/rent/...`, `.../verify/AR-…`,
`.../pricing`, `.../offices/<slug>`; custom scheme: `aqarrent://listing/<id>`.

## 4. Exact store builds

```bash
# Android signing (once): keep upload-keystore.jks OUT of git
keytool -genkey -v -keystore android/app/upload-keystore.jks -keyalg RSA \
  -keysize 2048 -validity 10000 -alias upload
cat > android/key.properties <<EOF
storeFile=../app/upload-keystore.jks
keyAlias=upload
storePassword=<secret>
keyPassword=<secret>
EOF

# All builds (script runs pub get, analyze, tests, then APK + AAB; IPA on macOS)
API_BASE=https://api.aqarrent.app \
MAP_TILES_URL=https://tiles.aqarrent.app/{z}/{x}/{y}.png \
FIREBASE_API_KEY=… FIREBASE_APP_ID=… FIREBASE_SENDER_ID=… FIREBASE_PROJECT_ID=… \
FIREBASE_IOS_BUNDLE_ID=com.aqarrent.app \
APPLE_TEAM_ID=<team-id> \
./scripts/mobile-build.sh
```

Outputs: `build/app/outputs/flutter-apk/app-*.apk`,
`build/app/outputs/bundle/release/app-release.aab`, `build/ios/ipa/*.ipa`.
`.github/workflows/mobile.yml` runs `flutter analyze`, `flutter test` and the
same release script on every push/PR (`workflow_dispatch` builds signed
artifacts from GitHub secrets).

## 5. Store readiness checklist

- **Icons / splash:** `assets/brand/app_icon.png` (1024×1024), adaptive
  foreground, Android mipmaps, iOS AppIcon set, native splash on both platforms.
  Regenerate with `flutter pub run flutter_launcher_icons`.
- **Permissions & justification:** camera and photo library for listing photos,
  verification documents and handover evidence; notifications for contracts,
  payments and handovers; Face ID / biometrics for local re-lock only. Android
  `POST_NOTIFICATIONS` requested at runtime by FCM; iOS descriptions in
  `Info.plist`. No location permission is requested — approximate pins are
  public listing data, exact pins are shown after login.
- **Privacy labels / Data Safety:** phone number (identity, app functionality),
  user content (photos/documents, app functionality), usage data (analytics),
  diagnostics (crash/performance). No tracking, no ads, no contact list, no
  financial data. `ios/Runner/PrivacyInfo.xcprivacy` declares UserDefaults,
  file timestamp, disk space and boot-time API reasons. Full mapping:
  `docs/privacy/pdpl-note.md` and `docs/launch-checklist.md`.
- **No mock paths:** production requires real Paymob/Twilio on the backend;
  dev OTP codes are never displayed or auto-filled when
  `ENVIRONMENT=production`; no fake payments, no fake push tokens.
- **Legal framing:** contracts are private agreements, not notarized, not
  officially registered, not executive instruments. The same honest copy is
  shown in the app, on the web and in the PDF. See `docs/legal-notes.md`.

## 6. Acceptance criteria

| # | Criterion | Verification |
|---|---|---|
| M1 | `flutter analyze --fatal-infos`, `flutter test`, integration smoke pass | CI `quality` job |
| M2 | Signed APK + AAB + IPA produced by one script from secrets | `workflow_dispatch` artifacts |
| M3 | Arabic RTL + English for every screen, no truncation | `test/core_test.dart` + manual QA matrix |
| M4 | Owner journey: create → photos → verification → checkout → receipt → contract → handover | integration/device tests |
| M5 | Tenant journey: search → map → detail → trust badge → contact → favorites → notifications | integration/device tests |
| M6 | Office journey: profile → invite → lead pipeline → dashboard | API-backed `OfficeScreen` |
| M7 | Deep links (universal + custom scheme) open the right screen | `DeepLinkService` unit tests |
| M8 | FCM push registers a real token, handles foreground/tap, no config → explicit skip | `push_service.dart` + Firebase console |
| M9 | Biometric re-lock, onboarding, offline cache, skeletons/empty/error states | `test/` + device QA |
| M10 | Release build fails fast on HTTP API / missing Firebase / dev environment | `AppConfig.assertReleaseConfig()` |

## 7. Screenshots & demo video

See [`mobile/docs/demo-script.md`](docs/demo-script.md) for the shot-by-shot
store screenshots list and a 60–90 second Arabic demo video script, plus the
exact `flutter screenshot` / `xcrun simctl` capture commands.

## 8. Known external dependencies (cannot be solved in code)

Flutter SDK, a macOS build machine for IPA, Apple Developer + Google Play
accounts, a Firebase project (APNs key / `google-services.json`), the production
map-tile host, and the domain hosting the association files. The repository
contains all source and configuration required; CI or a developer machine with
these accounts produces the binaries.

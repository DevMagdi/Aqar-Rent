# Aqar Rent — Flutter app (Android + iOS)

Full client for the broker-free rental marketplace: search + map + filters,
listing details with call/WhatsApp contact, owner tools (create/edit/submit
listings, photo uploads, verification, checkout, orders/receipts), favorites,
notifications, profile — **plus** the Phase-4 contract & handover screens.

## Layout

```
lib/
  main.dart                 app entry, RTL/ar locale, boot gate
  config.dart               API_BASE / FIREBASE_* via --dart-define
  push_service.dart         FCM registration → POST /me/devices (real FCM)
  api/api_client.dart       dio + token refresh (secure storage) + progress uploads
  models/models.dart        DTOs mirroring the OpenAPI schemas
  screens/
    login_screen.dart       OTP login (resend timer)
    home_shell.dart         bottom nav: search · favorites · notifications · profile
    search_screen.dart      query + filter sheet + infinite list + map tab
    map_screen.dart         MapLibre raster (tiles via MAP_TILES_URL) + price pins
    listing_detail_screen.dart  gallery, specs, favorite/share, call/WhatsApp
    favorites_screen.dart / notifications_screen.dart
    owner/
      dashboard_screen.dart     stats, edit/renew/mark-rented
      listing_wizard_screen.dart create/edit6-step wizard + photo uploads (progress)
      verification_screen.dart  ownership proof upload + status
      checkout_screen.dart       weeks/promo/methods → real orders; order pay screen
      orders_screen.dart         statuses + Arabic PDF receipt share
    contracts/              Phase 4: list, wizard, detail (OTP confirm, PDF), handover
```

## Build & run (Flutter SDK required — not available in this sandbox)

```bash
cd mobile
flutter create . --org com.aqarrent    # generate android/ + ios/ shells (once)
flutter pub get
flutter run --dart-define=API_BASE=http://10.0.2.2:8000 \
            --dart-define=MAP_TILES_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
```

### Push notifications (FCM) — real, needs your Firebase project

```bash
dart pub global activate flutterfire_cli
flutterfire configure --project=<your-firebase-project>   # adds google-services.json / GoogleService-Info.plist
flutter run --dart-define=API_BASE=https://api.example.com \
            --dart-define=FIREBASE_API_KEY=… --dart-define=FIREBASE_APP_ID=… \
            --dart-define=FIREBASE_SENDER_ID=… --dart-define=FIREBASE_PROJECT_ID=…
```
Without the `FIREBASE_*` defines the app runs normally and push registration is
skipped with a console note (nothing faked). Tokens are registered via the real
`POST /api/v1/me/devices` endpoint.

### Release / store-ready

```bash
flutter build appbundle --release --dart-define=API_BASE=https://api.example.com # Play
flutter build ipa --release --dart-define=API_BASE=https://api.example.com       # App Store
```
- Signing: Android upload-keystore (`key.properties` + `upload-keystore.jks`,
  never commit them), iOS distribution certificate + provisioning in Xcode.
- Privacy labels/data-safety must match `docs/privacy/pdpl-note.md`.
- Store submission checklist: `docs/launch-checklist.md`.

## Notes

- Same business rules as web: OTP login required for contact, BR-6 proof
  before first approval, ads only after payment, contracts freeze after dual
  OTP confirmation with SHA-256, handovers immutable after both parties.
- **Verified**: `flutter analyze` / `flutter test` / builds must be run on a
  machine with the Flutter SDK — this sandbox cannot download it
  (storage.googleapis.com unreachable); tracked as a go-live item in
  `PRODUCTION_READINESS.md`.

# Aqar Rent — mini Flutter app (contract & handover screens)

Phase-4 mobile client (scope agreed for this round): the **contract and
handover** flows on top of a minimal OTP login. The full Phase-3B app
(search/map/dashboard/checkout) is **not** part of this package — see
ASSUMPTIONS.md #76.

## What's in `lib/`

| File | Screen |
|---|---|
| `main.dart` | MaterialApp, Arabic (RTL) locale, routes |
| `api.dart` | API client: OTP login, token refresh (secure storage), contracts, handovers, media upload, PDF fetch (base64 → share) |
| `models.dart` | Contract/Handover DTOs + room/condition labels |
| `screens/login_screen.dart` | phone →6-digit OTP |
| `screens/contracts_screen.dart` | my contracts list (owner + tenant) |
| `screens/contract_wizard_screen.dart` |4-step create (listing+template → parties+NIDs → terms → review) |
| `screens/contract_detail_screen.dart` | status, terms, **OTP confirmation dialog**, PDF share, fee, handover list |
| `screens/handover_screen.dart` | check-in/check-out checklist, meters, keys, inventory, **camera capture + upload**, review comment, OTP confirm, PDF |

## Build & run (requires the Flutter SDK — not available in this sandbox)

```bash
cd mobile
flutter create .            # generates android/ + ios/ platform shells (once)
flutter pub get
flutter run --dart-define=API_BASE=http://10.0.2.2:8000   # Android emulator
# release:
flutter build apk --release --dart-define=API_BASE=https://api.example.com
flutter build ios --release --dart-define=API_BASE=https://api.example.com
```

- Tokens live in `flutter_secure_storage`; PDFs are fetched with the bearer
  token and handed to `share_plus` (they can never be fetched anonymously).
- Handover photos use `image_picker` (camera/gallery) and upload through the
  same authenticated multipart endpoint as the web client.
- Verification: `flutter analyze` + `flutter test` before release (SDK
  unavailable in this environment — flagged as a known gap in the Phase-4
  report; store submission steps: `docs/launch-checklist.md`).

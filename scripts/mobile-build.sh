#!/usr/bin/env bash
# Exact release build commands for Android (APK + App Bundle) and iOS (IPA).
# All values must come from CI secrets; nothing mock reaches production.
set -euo pipefail
cd "$(dirname "$0")/../mobile"

: "${API_BASE:?}"                 # https://api.aqarrent.app
: "${MAP_TILES_URL:?}"            # https://tiles.aqarrent.app/{z}/{x}/{y}.png
: "${FIREBASE_API_KEY:?}" "${FIREBASE_APP_ID:?}" "${FIREBASE_SENDER_ID:?}" "${FIREBASE_PROJECT_ID:?}"
: "${FIREBASE_IOS_BUNDLE_ID:=com.aqarrent.app}"
: "${DEEP_LINK_HOST:=aqarrent.app}"

DEFINES=(
  --dart-define=ENVIRONMENT=production
  --dart-define="API_BASE=${API_BASE}"
  --dart-define="MAP_TILES_URL=${MAP_TILES_URL}"
  --dart-define="DEEP_LINK_HOST=${DEEP_LINK_HOST}"
  --dart-define="FIREBASE_API_KEY=${FIREBASE_API_KEY}"
  --dart-define="FIREBASE_APP_ID=${FIREBASE_APP_ID}"
  --dart-define="FIREBASE_SENDER_ID=${FIREBASE_SENDER_ID}"
  --dart-define="FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}"
  --dart-define="FIREBASE_IOS_BUNDLE_ID=${FIREBASE_IOS_BUNDLE_ID}"
)

flutter pub get
flutter analyze --fatal-infos
flutter test

if [[ "$(uname -s)" == "Darwin" ]]; then
  : "${APPLE_TEAM_ID:?}" "${IOS_BUNDLE_ID:=com.aqarrent.app}"
  cat > ios/exportOptions.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store</string>
  <key>teamID</key><string>${APPLE_TEAM_ID}</string>
  <key>uploadSymbols</key><true/>
  <key>destination</key><string>upload</string>
</dict></plist>
PLIST
  flutter build ipa --release --export-options-plist=ios/exportOptions.plist "${DEFINES[@]}"
else
  flutter build apk --release --split-per-abi "${DEFINES[@]}"
  flutter build appbundle --release "${DEFINES[@]}"
  ls -lh build/app/outputs/flutter-apk/ build/app/outputs/bundle/release/
fi

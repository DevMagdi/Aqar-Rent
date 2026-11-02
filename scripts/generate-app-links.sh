#!/usr/bin/env bash
# Generates verified App Links / Universal Links association files from REAL
# release signing data. No placeholder fingerprints are committed to the repo.
#
# Required env:
#   ANDROID_SHA256_FINGERPRINT   SHA-256 of the Play upload/ app signing certificate
#   APPLE_TEAM_ID                Apple Developer Team ID
#   IOS_BUNDLE_ID                e.g. com.aqarrent.app
#   DEEP_LINK_HOST               e.g. aqarrent.app
set -euo pipefail

: "${ANDROID_SHA256_FINGERPRINT:?set ANDROID_SHA256_FINGERPRINT}"
: "${APPLE_TEAM_ID:?set APPLE_TEAM_ID}"
: "${IOS_BUNDLE_ID:=com.aqarrent.app}"
: "${DEEP_LINK_HOST:=aqarrent.app}"

mkdir -p web/public/.well-known
cat > web/public/.well-known/assetlinks.json <<JSON
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.aqarrent.app",
      "sha256_cert_fingerprints": ["${ANDROID_SHA256_FINGERPRINT}"]
    }
  }
]
JSON
cat > web/public/.well-known/apple-app-site-association <<JSON
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "${APPLE_TEAM_ID}.${IOS_BUNDLE_ID}",
        "paths": ["/ar/rent/*", "/en/rent/*", "/verify/*", "/pricing", "/offices/*"]
      }
    ]
  }
}
JSON
echo "Wrote assetlinks.json and apple-app-site-association for ${DEEP_LINK_HOST}"

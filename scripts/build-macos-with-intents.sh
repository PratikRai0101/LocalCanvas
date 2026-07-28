#!/usr/bin/env bash
set -euo pipefail

# Tauri owns the host .app. Xcode owns the App Intents extension because Apple
# discovers App Intents only from a native extension bundle.
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

npm run tauri build -- --bundles app

xcodebuild \
  -project src-tauri/LocalCanvasIntents/LocalCanvasIntents.xcodeproj \
  -target LocalCanvasIntents \
  -configuration Release \
  CODE_SIGNING_ALLOWED=NO \
  build

app="src-tauri/target/release/bundle/macos/LocalCanvas.app"
extension="src-tauri/LocalCanvasIntents/build/Release/LocalCanvasIntents.appex"

if [[ ! -d "$app" ]]; then
  echo "Expected Tauri app bundle at $app" >&2
  exit 1
fi

mkdir -p "$app/Contents/PlugIns"
rm -rf "$app/Contents/PlugIns/LocalCanvasIntents.appex"
ditto "$extension" "$app/Contents/PlugIns/LocalCanvasIntents.appex"

# Use the configured Developer ID when packaging for distribution; ad-hoc
# signing keeps local builds runnable without a provisioning profile.
signing_identity="${APPLE_SIGNING_IDENTITY:--}"
codesign --force --sign "$signing_identity" \
  --entitlements src-tauri/LocalCanvasIntents/LocalCanvasIntents.entitlements \
  "$app/Contents/PlugIns/LocalCanvasIntents.appex"
codesign --force --sign "$signing_identity" \
  --entitlements src-tauri/Entitlements.plist \
  "$app"
codesign --verify --deep --strict --verbose=2 "$app"

echo "Built Spotlight-enabled app: $app"

#!/usr/bin/env bash
# Puts a built executable into an app bundle: Cloudstash.app with its Info.plist and icon.
# scripts/run.sh and scripts/release.sh both use it.
#
#   scripts/bundle.sh <executable> <path/to/Cloudstash.app> <version>
#
# CLOUDSTASH_URL, CLOUDSTASH_FAKE_UPDATE and CLOUDSTASH_UPDATE_FEED, when set, go into the bundle's environment: apps
# started by Launch Services, as a deep link starts them, get no shell environment.
set -euo pipefail

exe="$1"
app="$2"
version="$3"

cd "$(dirname "$0")/.."
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$exe" "$app/Contents/MacOS/cloudstash-native"
cp assets/AppIcon.icns "$app/Contents/Resources/AppIcon.icns"

environment=""
for name in CLOUDSTASH_URL CLOUDSTASH_FAKE_UPDATE CLOUDSTASH_UPDATE_FEED; do
  if [[ -n "${!name:-}" ]]; then
    environment+="<key>${name}</key><string>${!name}</string>"
  fi
done
if [[ -n "$environment" ]]; then
  environment="<key>LSEnvironment</key><dict>${environment}</dict>"
fi

cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>dev.cloudstash.native</string>
  <key>CFBundleName</key><string>Cloudstash</string>
  <key>CFBundleDisplayName</key><string>Cloudstash</string>
  <key>CFBundleExecutable</key><string>cloudstash-native</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundleVersion</key><string>${version}</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key><string>dev.cloudstash.native</string>
      <key>CFBundleURLSchemes</key><array><string>cloudstash</string></array>
    </dict>
  </array>
  $environment
</dict>
</plist>
PLIST

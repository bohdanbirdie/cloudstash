#!/usr/bin/env bash
# Puts a built executable into an app bundle with its Info.plist and icon.
# scripts/run.sh and scripts/release.sh both use it.
#
#   scripts/bundle.sh <executable> <path/to/App.app> <version> [dev]
#
# With `dev` it makes Cloudstash Dev, the debug build's identity (src/flavor.rs): its own name,
# bundle identifier, executable, link scheme and blue icon, so it runs beside the released app.
# The names here must match src/flavor.rs.
#
# CLOUDSTASH_URL, CLOUDSTASH_FAKE_UPDATE and CLOUDSTASH_UPDATE_FEED, when set, go into the bundle's environment: apps
# started by Launch Services, as a deep link starts them, get no shell environment.
set -euo pipefail

exe="$1"
app="$2"
version="$3"

if [[ "${4:-}" == dev ]]; then
  name="Cloudstash Dev" id=dev.cloudstash.native.dev executable=cloudstash-dev scheme=cloudstash-dev icon=AppIconDev
else
  name=Cloudstash id=dev.cloudstash.native executable=cloudstash-native scheme=cloudstash icon=AppIcon
fi

cd "$(dirname "$0")/.."
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$exe" "$app/Contents/MacOS/$executable"
cp "assets/$icon.icns" "$app/Contents/Resources/AppIcon.icns"

environment=""
for var in CLOUDSTASH_URL CLOUDSTASH_FAKE_UPDATE CLOUDSTASH_UPDATE_FEED; do
  if [[ -n "${!var:-}" ]]; then
    environment+="<key>${var}</key><string>${!var}</string>"
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
  <key>CFBundleIdentifier</key><string>${id}</string>
  <key>CFBundleName</key><string>${name}</string>
  <key>CFBundleDisplayName</key><string>${name}</string>
  <key>CFBundleExecutable</key><string>${executable}</string>
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
      <key>CFBundleURLName</key><string>${id}</string>
      <key>CFBundleURLSchemes</key><array><string>${scheme}</string></array>
    </dict>
  </array>
  $environment
</dict>
</plist>
PLIST

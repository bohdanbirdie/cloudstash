#!/usr/bin/env bash
# Builds Cloudstash.app inside target/ and opens it. The bundle registers the
# cloudstash:// scheme, which a bare `cargo run` binary cannot receive.
#
#   scripts/run.sh                                        # against https://cloudstash.dev
#   CLOUDSTASH_URL=http://127.0.0.1:3000 scripts/run.sh   # against a local dev server
set -euo pipefail

cd "$(dirname "$0")/.."
cargo build

app=target/Cloudstash.app
rm -rf "$app"
mkdir -p "$app/Contents/MacOS"
cp target/debug/cloudstash-native "$app/Contents/MacOS/"

# Apps started by Launch Services, as a deep link starts them, get no shell
# environment, so the server address travels in the bundle.
environment=""
if [[ -n "${CLOUDSTASH_URL:-}" ]]; then
  environment="<key>LSEnvironment</key><dict><key>CLOUDSTASH_URL</key><string>${CLOUDSTASH_URL}</string></dict>"
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
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.0.0</string>
  <key>CFBundleVersion</key><string>0</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
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

codesign --force --sign - "$app" >/dev/null
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$app"

# Quit a running copy so the new build takes the links.
pkill -x cloudstash-native 2>/dev/null || true
open "$app"

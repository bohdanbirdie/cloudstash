#!/usr/bin/env bash
# Builds a release of Cloudstash into target/release/out/, at Cargo.toml's version:
#
#   Cloudstash-<version>.dmg   the first install: drag the app to Applications
#   Cloudstash-<version>.zip   the update the app downloads (src/update.rs)
#   latest.json                the feed the app reads: version, the zip's address and signature,
#                              and the oldest version allowed to run (Cargo.toml's minimum-version)
#
# The app runs on Apple Silicon and Intel, is signed with a Developer ID and hardened runtime,
# and is notarized and stapled, as is the disk image. .github/workflows/native-release.yml runs
# it when main gets a new version; it runs the same on a Mac with these set:
#
#   SIGN_IDENTITY        "Developer ID Application: …" in the keychain
#   NOTARY_KEY_PATH      App Store Connect API key (.p8), with NOTARY_KEY_ID and NOTARY_ISSUER
#   UPDATE_KEY_PATH      the Ed25519 private key (PEM) whose public half is update.rs's PUBLIC_KEY
#   DOWNLOAD_URL         where the release's files will be, e.g.
#                        https://github.com/bohdanbirdie/cloudstash/releases/download/native-v0.1.0
set -euo pipefail

cd "$(dirname "$0")/.."
: "${SIGN_IDENTITY:?}" "${NOTARY_KEY_PATH:?}" "${NOTARY_KEY_ID:?}" "${NOTARY_ISSUER:?}" "${UPDATE_KEY_PATH:?}" "${DOWNLOAD_URL:?}"
openssl="${OPENSSL:-$(brew --prefix openssl@3)/bin/openssl}"
version="$(sed -n 's/^version = "\(.*\)"/\1/p' Cargo.toml | head -1)"
minimum="$(sed -n 's/^minimum-version = "\(.*\)"/\1/p' Cargo.toml | head -1)"
: "${minimum:?Cargo.toml has no minimum-version}"

cargo build --locked --release --target aarch64-apple-darwin
cargo build --locked --release --target x86_64-apple-darwin
out=target/release/out
rm -rf "$out"
mkdir -p "$out/disk"
lipo -create -output "$out/cloudstash-native" \
  target/aarch64-apple-darwin/release/cloudstash-native target/x86_64-apple-darwin/release/cloudstash-native

app="$out/disk/Cloudstash.app"
scripts/bundle.sh "$out/cloudstash-native" "$app" "$version"
codesign --force --options runtime --timestamp --sign "$SIGN_IDENTITY" "$app"
codesign --verify --deep --strict "$app"

notarize() {
  xcrun notarytool submit "$1" --key "$NOTARY_KEY_PATH" --key-id "$NOTARY_KEY_ID" --issuer "$NOTARY_ISSUER" --wait
}

# Notarize the app, then staple the ticket so it opens without asking Apple when offline.
ditto -c -k --keepParent "$app" "$out/notarize.zip"
notarize "$out/notarize.zip"
rm "$out/notarize.zip"
xcrun stapler staple "$app"

zip="Cloudstash-${version}.zip"
ditto -c -k --keepParent "$app" "$out/$zip"
signature="$("$openssl" pkeyutl -sign -inkey "$UPDATE_KEY_PATH" -rawin -in "$out/$zip" | base64)"

dmg="Cloudstash-${version}.dmg"
ln -s /Applications "$out/disk/Applications"
hdiutil create -volname Cloudstash -srcfolder "$out/disk" -format UDZO -ov "$out/$dmg"
codesign --force --timestamp --sign "$SIGN_IDENTITY" "$out/$dmg"
notarize "$out/$dmg"
xcrun stapler staple "$out/$dmg"

cat > "$out/latest.json" <<JSON
{
  "version": "${version}",
  "url": "${DOWNLOAD_URL}/${zip}",
  "signature": "${signature}",
  "minimum": "${minimum}",
  "pub_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON
rm -rf "$out/disk" "$out/cloudstash-native"
ls -l "$out"

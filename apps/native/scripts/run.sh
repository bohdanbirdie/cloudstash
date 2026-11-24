#!/usr/bin/env bash
# Builds Cloudstash.app inside target/ and opens it. The bundle registers the
# cloudstash:// scheme, which a bare `cargo run` binary cannot receive.
#
#   scripts/run.sh                                        # against https://cloudstash.dev
#   CLOUDSTASH_URL=http://127.0.0.1:3000 scripts/run.sh   # against a local dev server
#   CLOUDSTASH_FAKE_UPDATE=ready scripts/run.sh           # a pretend update: ready, failed or required (src/update.rs)
set -euo pipefail

cd "$(dirname "$0")/.."
cargo build

app=target/Cloudstash.app
scripts/bundle.sh target/debug/cloudstash-native "$app" 0.0.0

# The keychain trusts the app by its code signature. An ad-hoc signature changes with every
# build, so macOS would ask for the login password on each launch; a certificate keeps it
# stable, and one "Always Allow" lasts. CLOUDSTASH_SIGN_IDENTITY overrides the pick; with no
# Apple Development certificate the bundle falls back to ad-hoc.
identity="${CLOUDSTASH_SIGN_IDENTITY:-$(security find-identity -v -p codesigning | sed -n 's/.*"\(Apple Development: [^"]*\)".*/\1/p' | head -1)}"
codesign --force --sign "${identity:--}" "$app" >/dev/null
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$app"

# Quit a running copy so the new build takes the links.
pkill -x cloudstash-native 2>/dev/null || true
while pgrep -x cloudstash-native >/dev/null; do sleep 0.2; done
# The app logs to ~/Library/Logs/Cloudstash/cloudstash.log; what it and its libraries print
# (rune's warnings among them) goes there too.
log="$HOME/Library/Logs/Cloudstash/cloudstash.log"
mkdir -p "$(dirname "$log")"
open --stdout "$log" --stderr "$log" "$app"

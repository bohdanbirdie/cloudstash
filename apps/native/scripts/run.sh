#!/usr/bin/env bash
# Builds Cloudstash Dev (the debug build, src/flavor.rs) into target/ and opens it. It runs beside
# the released Cloudstash: its own name, blue icon, data, sign-in, log and link scheme, and no
# updates. The bundle registers the cloudstash-dev:// scheme, which a bare `cargo run` binary cannot
# receive.
#
#   scripts/run.sh                                          # against the local server, http://127.0.0.1:3000
#   CLOUDSTASH_URL=https://cloudstash.dev scripts/run.sh    # against another server
#   CLOUDSTASH_FAKE_UPDATE=ready scripts/run.sh             # a pretend update: ready, failed or required (src/update.rs)
set -euo pipefail

cd "$(dirname "$0")/.."
cargo build

app="target/Cloudstash Dev.app"
scripts/bundle.sh target/debug/cloudstash-native "$app" 0.0.0 dev

# The keychain trusts the app by its code signature. An ad-hoc signature changes with every
# build, so macOS would ask for the login password on each launch; a certificate keeps it
# stable, and one "Always Allow" lasts. CLOUDSTASH_SIGN_IDENTITY overrides the pick; with no
# Apple Development certificate the bundle falls back to ad-hoc.
identity="${CLOUDSTASH_SIGN_IDENTITY:-$(security find-identity -v -p codesigning | sed -n 's/.*"\(Apple Development: [^"]*\)".*/\1/p' | head -1)}"
codesign --force --sign "${identity:--}" "$app" >/dev/null
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$app"

# Quit a running Cloudstash Dev (from any checkout) so the new build takes the links. The
# released app's executable is cloudstash-native, so it keeps running.
pkill -x cloudstash-dev 2>/dev/null || true
while pgrep -x cloudstash-dev >/dev/null; do sleep 0.2; done
# The app logs to ~/Library/Logs/Cloudstash/cloudstash-dev.log; what it and its libraries print
# (rune's warnings among them) goes there too.
log="$HOME/Library/Logs/Cloudstash/cloudstash-dev.log"
mkdir -p "$(dirname "$log")"
open --stdout "$log" --stderr "$log" "$app"

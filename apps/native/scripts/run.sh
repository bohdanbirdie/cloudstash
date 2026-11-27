#!/usr/bin/env bash
# Builds this worktree's Cloudstash Dev (the debug build, src/flavor.rs) into target/ and opens it
# against this worktree's dev server. It runs beside the released Cloudstash and beside every other
# worktree's Cloudstash Dev: each worktree's copy has its own name ("Cloudstash Dev · <branch>"),
# data, sign-in, log and link scheme, and its icon carries the dev server's port
# (scripts/port-icon.swift).
# There are no updates. The bundle registers its link scheme, which a bare `cargo run` binary
# cannot receive.
#
#   scripts/run.sh                                          # against this worktree's `bun run dev`
#   CLOUDSTASH_URL=https://cloudstash.dev scripts/run.sh    # against another server
#   CLOUDSTASH_FAKE_UPDATE=ready scripts/run.sh             # a pretend update: ready, failed or required (src/update.rs)
set -euo pipefail

cd "$(dirname "$0")/.."
root="$(git rev-parse --show-toplevel)"

# `bun run dev` (scripts/dev.ts) writes its address here while it runs.
if [[ -z "${CLOUDSTASH_URL:-}" ]]; then
  if [[ ! -s "$root/.alchemy/dev-url" ]]; then
    echo "No dev server is running in this worktree. Start it with \`bun run dev\`, or set CLOUDSTASH_URL." >&2
    exit 1
  fi
  CLOUDSTASH_URL="$(head -1 "$root/.alchemy/dev-url")"
fi
export CLOUDSTASH_URL

# One copy per worktree, named after the worktree's path and labelled with its branch (or port).
export CLOUDSTASH_INSTANCE="$(printf %s "$root" | shasum | cut -c1-8)"
hostport="${CLOUDSTASH_URL#*://}"
hostport="${hostport%%/*}"
port="${hostport##*:}"
branch="$(git -C "$root" branch --show-current)"
export CLOUDSTASH_INSTANCE_LABEL="${branch##*/}"
[[ -n "$CLOUDSTASH_INSTANCE_LABEL" ]] || CLOUDSTASH_INSTANCE_LABEL="$port"
executable="cloudstash-dev-$CLOUDSTASH_INSTANCE"

cargo build

# The icon with the port drawn on, made once per port.
icon="target/port-icon/$port.icns"
if [[ ! -s "$icon" ]]; then
  iconset="target/port-icon/$port.iconset"
  rm -rf "$iconset" && mkdir -p "$iconset"
  swift scripts/port-icon.swift assets/AppIconDev.icns "$port" "$iconset/icon_512x512@2x.png"
  for size in 512 256 128 32 16; do
    sips -z "$size" "$size" "$iconset/icon_512x512@2x.png" --out "$iconset/icon_${size}x${size}.png" >/dev/null
  done
  iconutil -c icns "$iconset" -o "$icon"
  rm -rf "$iconset"
fi
export CLOUDSTASH_ICON="$icon"

app="target/Cloudstash Dev.app"
scripts/bundle.sh target/debug/cloudstash-native "$app" 0.0.0 dev

# Signed with the Apple Development certificate when there is one, so macOS sees one app across
# builds. Dev keeps its sign-in key in a file, not the keychain (src/auth.rs), so no build asks
# for the login password. CLOUDSTASH_SIGN_IDENTITY overrides the pick; with no Apple Development
# certificate the bundle falls back to ad-hoc.
identity="${CLOUDSTASH_SIGN_IDENTITY:-$(security find-identity -v -p codesigning | sed -n 's/.*"\(Apple Development: [^"]*\)".*/\1/p' | head -1)}"
codesign --force --sign "${identity:--}" "$app" >/dev/null
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$app"

# Quit this worktree's running copy so the new build takes its links. Other worktrees' copies and
# the released app have other executables, so they keep running.
pkill -x "$executable" 2>/dev/null || true
while pgrep -x "$executable" >/dev/null; do sleep 0.2; done
# The app logs to ~/Library/Logs/Cloudstash/cloudstash-dev-<instance>.log; what it and its
# libraries print (rune's warnings among them) goes there too.
log="$HOME/Library/Logs/Cloudstash/$executable.log"
mkdir -p "$(dirname "$log")"
echo "Cloudstash Dev · $CLOUDSTASH_INSTANCE_LABEL against $CLOUDSTASH_URL (log: $log)"
# Launch Services can still be letting go of the copy just quit; one retry covers it.
open --stdout "$log" --stderr "$log" "$app" 2>/dev/null || { sleep 1; open --stdout "$log" --stderr "$log" "$app"; }

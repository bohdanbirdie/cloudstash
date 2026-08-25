#!/bin/bash

set -euo pipefail

template=".dev.vars.example"
target=".dev.vars"
account="${OP_ACCOUNT:-my.1password.com}"

if ! command -v op >/dev/null 2>&1; then
  echo "1Password CLI is required: https://developer.1password.com/docs/cli/get-started/" >&2
  exit 1
fi

if [[ ! -f "$template" ]]; then
  echo "Missing 1Password template: $template" >&2
  exit 1
fi

temp_file="$(mktemp "${target}.tmp.XXXXXX")"
cleanup() {
  rm -f "$temp_file"
}
trap cleanup EXIT

op inject \
  --account "$account" \
  --in-file "$template" \
  --out-file "$temp_file" \
  --file-mode 0600 \
  --force \
  >/dev/null

if [[ ! -s "$temp_file" ]] || grep -Eq '\{\{[[:space:]]*op://' "$temp_file"; then
  echo "1Password produced an empty or unresolved environment file; keeping $target unchanged." >&2
  exit 1
fi

mv -f "$temp_file" "$target"
trap - EXIT

echo "Synced $target from 1Password (mode 0600)."

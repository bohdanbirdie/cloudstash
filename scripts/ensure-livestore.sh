#!/bin/bash
# Ensure the vendored livestore fork (git submodule) is checked out and its deps
# installed, so the Vite alias (tools/livestore-local.ts) can resolve @livestore/*
# to source at build time. Runs ahead of `build` / `build:prod` so a fresh
# checkout (CI, Cloudflare Workers Builds) self-bootstraps without manual steps.
#
# Idempotent and non-destructive: it skips both steps when already present, so it
# never clobbers a local vendor/livestore you're actively hacking on. To force a
# reinstall after bumping the pinned SHA, run pnpm install inside vendor/livestore.
#
# LIVESTORE_VENDOR_MINIMAL=1 trims both steps to what a *deploy* build needs:
# shallow submodule history, and only the workspace packages the app imports plus
# their deps (3.3G -> 1.2G, no playwright or docs toolchain). The deploy scripts
# set it. Local dev and CI test jobs deliberately keep the full install, because
# tests and `pnpm --filter` runs inside vendor/livestore need the other packages.
set -euo pipefail

minimal="${LIVESTORE_VENDOR_MINIMAL:-0}"

if [ ! -e vendor/livestore/package.json ]; then
  echo "[livestore] checking out vendor/livestore submodule..."
  if [ "$minimal" = "1" ]; then
    git submodule update --init --depth 1 vendor/livestore
  else
    git submodule update --init vendor/livestore
  fi
fi

# Derive the deploy filter from real imports so a new @livestore/* dependency
# cannot silently drop out of the minimal install. `...` includes each package's
# own dependencies.
filters=()
if [ "$minimal" = "1" ]; then
  while read -r pkg; do
    [ -d "vendor/livestore/packages/@livestore/$pkg" ] || continue
    filters+=(--filter "@livestore/$pkg...")
  done < <(grep -rhoE '@livestore/[a-z0-9-]+' src tools | sed 's|@livestore/||' | sort -u)
  if [ ${#filters[@]} -eq 0 ]; then
    echo "[livestore] found no @livestore imports — refusing a minimal install" >&2
    exit 1
  fi
  echo "[livestore] minimal install: ${#filters[@]} workspace package(s)"
fi

# Record which mode produced the current node_modules. A minimal install must not
# satisfy a later full request — the packages it omits are exactly the ones local
# LiveStore tests need — so full mode reinstalls over it. A full install satisfies
# both. Installs predating this marker were full, so a missing marker means full.
mode_file=vendor/livestore/node_modules/.cloudstash-install-mode
want="full"
[ "$minimal" = "1" ] && want="minimal"

have=""
if [ -d vendor/livestore/node_modules ]; then
  have="full"
  [ -f "$mode_file" ] && have="$(cat "$mode_file")"
fi

if [ -z "$have" ] || { [ "$want" = "full" ] && [ "$have" = "minimal" ]; }; then
  if [ "$have" = "minimal" ]; then
    echo "[livestore] upgrading minimal install to full..."
  else
    echo "[livestore] installing vendor/livestore deps..."
  fi
  (
    cd vendor/livestore
    # Pick a usable pnpm (vendor is a pnpm workspace; cloudstash's root uses bun).
    # Probe by actually RUNNING `pnpm --version` from here — `command -v` is not
    # enough: Cloudflare's asdf image has a `pnpm` shim that `command -v` finds
    # but that errors on use. The probe runs in vendor/ (packageManager=pnpm), not
    # the bun root, so a real local pnpm passes. corepack and npx both ship with
    # Node and bypass the broken shim.
    if pnpm --version >/dev/null 2>&1; then
      pm="pnpm"
    elif corepack --version >/dev/null 2>&1; then
      export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
      pm="corepack pnpm"
    else
      pm="npx --yes pnpm@11.8.0"
    fi
    # vendor's pnpm-workspace.yaml sets `storeDir: .devenv/pnpm-store-pure-v1`,
    # which drops a huge content-addressable store INSIDE the repo. Vite's watcher
    # recurses into it and crashes on Linux (EINVAL on the store's files). Override
    # to a store outside the repo (pnpm's normal global-store mode) — node_modules
    # still hardlinks to it, but Vite never sees it.
    #
    # The path is `.pnpm-store` on purpose: that is the directory Cloudflare's
    # Workers Builds cache preserves between builds. A custom name here means the
    # ~3G store is re-downloaded on every deploy. Override with PNPM_STORE_DIR.
    store="${PNPM_STORE_DIR:-${HOME:-/tmp}/.pnpm-store}"
    echo "[livestore] installing with: $pm (store: $store)"
    $pm install --frozen-lockfile --store-dir "$store" \
      ${filters[@]+"${filters[@]}"}
  )
  printf '%s\n' "$want" > "$mode_file"
fi

echo "[livestore] vendor/livestore ready"

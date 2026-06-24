#!/bin/bash
# Ensure the vendored livestore fork (git submodule) is checked out and its deps
# installed, so the Vite alias (tools/livestore-local.ts) can resolve @livestore/*
# to source at build time. Runs ahead of `build` / `build:prod` so a fresh
# checkout (CI, Cloudflare Workers Builds) self-bootstraps without manual steps.
#
# Idempotent and non-destructive: it skips both steps when already present, so it
# never clobbers a local vendor/livestore you're actively hacking on. To force a
# reinstall after bumping the pinned SHA, run pnpm install inside vendor/livestore.
set -euo pipefail

if [ ! -e vendor/livestore/package.json ]; then
  echo "[livestore] checking out vendor/livestore submodule..."
  git submodule update --init vendor/livestore
fi

if [ ! -d vendor/livestore/node_modules ]; then
  echo "[livestore] installing vendor/livestore deps..."
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
      pm="npx --yes pnpm@11.3.0"
    fi
    echo "[livestore] installing with: $pm"
    $pm install --frozen-lockfile
  )
fi

echo "[livestore] vendor/livestore ready"

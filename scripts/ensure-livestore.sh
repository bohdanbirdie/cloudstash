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
  if command -v pnpm >/dev/null 2>&1; then
    (cd vendor/livestore && pnpm install --frozen-lockfile)
  else
    # No global pnpm (e.g. Cloudflare's bun image) — run the pinned pnpm via npx.
    (cd vendor/livestore && npx --yes pnpm@11.3.0 install --frozen-lockfile)
  fi
fi

echo "[livestore] vendor/livestore ready"

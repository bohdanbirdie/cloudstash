# Livestore fork integration — strategy, status & roadmap

Canonical entry point for "cloudstash runs a fork of livestore." A fresh agent
should be able to read this top-to-bottom and carry the work forward without
prior context. Deep mechanism detail lives in
[[architecture/livestore-local-source-linking]]; this doc is the strategy, the
achieved state, and how to operate it. **Status: the submodule-vendoring target
is implemented** (2026-06-24) — local builds, tests, and production all consume
the vendored fork via one Vite alias.

## Goal

cloudstash depends on livestore changes (DO hibernation work) that are **not in a
published npm snapshot** — they live in a fork/PR. We need to consume that fork's
code in **both local dev and production**, **reproducibly**, **without
maintaining a large bun patch**, and **without depending on an upstream merge**
that may never come.

The fork: `bohdanbirdie/livestore`, branch `bohdan/fix/do-hibernation-chain`,
upstream PR livestorejs/livestore#1338 ("DO hibernation, end to end"). It is the
upstream version of the surgical hibernation patch cloudstash used to carry.

## Current state (migrated 2026-06-24)

local == prod: one Vite alias points dev, tests, and the production build at the
vendored fork source. No more "dev uses the clone, prod ships the snapshot" gap.

- **Vendored fork:** `vendor/livestore` is a **committed git submodule** pinned to
  `bohdanbirdie/livestore` @ `36dd15dac` (branch `bohdan/fix/do-hibernation-chain`,
  upstream PR #1338). Recorded in `.gitmodules`; it is the single source of
  livestore truth.
- **On by default.** `tools/livestore-local.ts` aliases every `@livestore/*`
  import to the submodule source for `vp dev`, `vp build`, `test:unit`, and
  `test:e2e` — **no env var**. Off-switch: `LIVESTORE_PUBLISHED=1` (or `bun run
dev:published`) forces the published snapshot (A/B "is the bug mine or
  livestore's?"). Scratch experiments: `git checkout` a branch inside
  `vendor/livestore` — the alias reads that working tree.
- **Published pin retained:** every `@livestore/*` in `package.json` stays at
  `0.0.0-snapshot-6e9abadf4bdc91a2f7deea3e47be8ffd75d4c27c`. Those still provide
  types for `tsgo` typecheck, the wasm packages, and the `LIVESTORE_PUBLISHED=1`
  path — **keep them**. `bun.lock` is unchanged by this migration.
- **Patches:** the two surgical `@livestore/*` bun patches are gone (the fork
  carries that work now). Only `@effect/rpc@0.75.1` remains in
  `patchedDependencies` — **keep it**, it patches a different dependency
  (`RpcSerialization.js`) and is unrelated to the fork.
- **Production build guard:** `vite.config.ts` throws on `vp build` if the
  submodule source is absent and `LIVESTORE_PUBLISHED` isn't set — a missing
  `git submodule update --init` can't silently ship the unpatched snapshot.
- **CI:** `.github/workflows/ci.yml` checks out with `submodules: true` and runs
  `pnpm install --frozen-lockfile` in `vendor/livestore` (pnpm 11.3.0) before the
  test job.
- **Setup:** `bun run livestore:install` (also run by `bun run sync`) does
  `git submodule update --init vendor/livestore && pnpm --dir vendor/livestore install`.
- **Wiring:** `tools/livestore-local.ts` (alias generator) consumed by
  `vite.config.ts`, `vitest.config.ts`, `vitest.e2e.config.ts`.

### How the mechanism works (summary)

- **No build step.** livestore's package `exports` point at `src/*.ts` (only
  `publishConfig.exports` use `dist/`); Vite transpiles the source on the fly.
- `tools/livestore-local.ts` reads each vendored package's `exports` map and emits
  one exact-match Vite alias per entrypoint, plus `resolve.dedupe`.
- **Three gotchas baked into the helper** (full rationale in the mechanism doc):
  1. `dedupe: ['effect']` — clone + cloudstash would otherwise load two copies of
     Effect → broken `Context`/`Layer` identity. Versions must match (both
     3.21.2 today).
  2. `wa-sqlite` / `sqlite-wasm` are **excluded from aliasing and deduped to the
     published copy** — their prebuilt wasm only loads from the published dist
     layout, and the clone's pnpm symlinks would otherwise pull broken copies.
  3. **Platform-conditional exports** (`{browser,node,…}`, e.g.
     `@livestore/utils/cuid`) are **not aliased** — a static alias can't switch
     per build target, so they resolve from the published package per-env.
- **DO schema changes** in the fork require `bun run clean:local-state` before
  running (livestore creates DO tables with `CREATE TABLE IF NOT EXISTS` and
  never reconciles columns — see the migration gotcha below).

## Production options considered (and why rejected)

| Option                                                   | Verdict                                                                                                                                               |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hand-written or auto-generated **bun patch**             | ❌ Size = the divergence (+96 commits), and it's a dist-level diff — huge and brittle. Auto-generating removes typing, not size.                      |
| **GitHub git-dependency** (`"@livestore/x": "github:…"`) | ❌ livestore is a `workspace:*` monorepo; the repo root isn't the package, cross-deps don't resolve outside the workspace, and packages need a build. |
| **Republish** to a registry                              | ❌ `@livestore` scope is owned by livestorejs; would require renaming to our scope or a private registry. Ruled out.                                  |
| **Wait for upstream merge** + snapshot bump              | Cleanest long-term, but "not always available" — can't be the standing strategy.                                                                      |
| **Git submodule vendoring**                              | ✅ Implemented (below).                                                                                                                               |

## How it's wired (universal submodule vendoring, local == prod)

One source of truth, one mechanism, used by dev and production — so **what you
test locally is exactly what ships**.

- The fork is a **SHA-locked git submodule** at `vendor/livestore` (committed,
  reproducible, CI-clonable) — the single source of truth. Scratch experiments
  happen in its own working tree (`git checkout` a branch inside it).
- `tools/livestore-local.ts` points at `vendor/livestore` and runs **on by
  default**, with one off-switch: `LIVESTORE_PUBLISHED=1` forces the published
  snapshot.
- The same Vite alias drives `vp dev` (local) and `vp build` (prod). At build
  time the fork source is **inlined into the worker bundle**; `wrangler deploy`
  ships that — no runtime dependency on the submodule. `vite.config.ts` throws on
  `vp build` if the submodule is missing (and `LIVESTORE_PUBLISHED` isn't set), so
  prod can't silently fall back to the snapshot.
- **CI** checks out with `submodules: true` and runs `pnpm install --frozen-lockfile`
  in `vendor/livestore` before the test job. cloudstash stays on bun; the
  submodule uses pnpm (same split as the raycast clone).
- **`wa-sqlite` / `sqlite-wasm` stay on the published snapshot** in both dev and
  prod. Safe here: PR #1338 doesn't touch them and the +96-commit drift changed
  `wa-sqlite` only trivially, so the skew is ≈ 0. (Building them from source
  drags in the emscripten/wasm toolchain — not worth it.)
- **`effect` dedupe stays.** Re-verify the fork's `effect` version matches
  cloudstash's on every fork bump (3.21.2 today).

**Why vendoring works where git-deps/tarballs don't:** the `workspace:*`
cross-deps resolve **inside** the vendored workspace (via its own `pnpm
install`), so there's no per-package version juggling.

## Validation checklist (run before trusting prod / on every fork bump)

- `bun run typecheck`, `bun run check`
- `bun run test:unit` and `bun run test:e2e` (default submodule mode, plus a
  `LIVESTORE_PUBLISHED=1` pass to confirm the A/B hatch still builds)
- a real `bun run build` (the from-source build inlines all of livestore — a
  broader surface than the published dist), then deploy to a preview and
  smoke-test the DO sync path **and** the browser store.
- `bun run clean:local-state` first if the fork changed any DO SQLite schema.

## Gotchas / DO NOT

- **Keep** the `@effect/rpc@0.75.1` patch and its patch file.
- **Don't** build `wa-sqlite`/`sqlite-wasm` from source; keep them published.
- **DO schema changes in the fork are dangerous.** livestore versions its DO
  tables via the table _name_ (`rpc_subscription_${PERSISTENCE_FORMAT_VERSION}`)
  and creates them with `CREATE TABLE IF NOT EXISTS` — it never migrates columns.
  A schema change that forgets to bump `PERSISTENCE_FORMAT_VERSION` silently
  breaks any DO that already has that table (`no such column: …`). Locally,
  `bun run clean:local-state` resets it; for deployed DOs the version must be
  bumped. This is exactly how PR #1338's missed bump surfaced: its
  `rpc_subscription_7` table uses column `generation` while our old patch's used
  `subscribedAt`, so a stale local DO threw `no such column: generation` until a
  `clean:local-state` reset.
- The deployed worker would be built **from livestore source** — own that build
  path; smoke-test every fork bump.
- On each fork bump: `pnpm install` the new SHA, re-verify `effect` version
  parity, and re-run the validation suite.

## To ship a new fork state (steady-state workflow)

1. Develop in `vendor/livestore` (real fork checkout), push to the fork branch.
2. `git add vendor/livestore` in cloudstash to record the new SHA → that commit
   is what builds and deploys. Re-`pnpm --dir vendor/livestore install`.
3. Run the validation checklist above before deploy.

## References

- Mechanism + the three gotchas in depth: [[architecture/livestore-local-source-linking]]
- Patch removal (superseded by vendoring): [[todos/remove-livestore-patches]]
- Fork: `bohdanbirdie/livestore`, branch `bohdan/fix/do-hibernation-chain`,
  upstream PR livestorejs/livestore#1338.

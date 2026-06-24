# Livestore fork integration — strategy, status & roadmap

Canonical entry point for "cloudstash runs a fork of livestore." A fresh agent
should be able to read this top-to-bottom and carry the work forward without
prior context. Deep mechanism detail lives in
[[architecture/livestore-local-source-linking]]; this doc is the strategy + the
current/target state + the migration plan.

## Goal

cloudstash depends on livestore changes (DO hibernation work) that are **not in a
published npm snapshot** — they live in a fork/PR. We need to consume that fork's
code in **both local dev and production**, **reproducibly**, **without
maintaining a large bun patch**, and **without depending on an upstream merge**
that may never come.

The fork: `bohdanbirdie/livestore`, branch `bohdan/fix/do-hibernation-chain`,
upstream PR livestorejs/livestore#1338 ("DO hibernation, end to end"). It is the
upstream version of the surgical hibernation patch cloudstash used to carry.

## Current state (2026-06-24)

- **Published pin:** every `@livestore/*` in `package.json` is
  `0.0.0-snapshot-6e9abadf4bdc91a2f7deea3e47be8ffd75d4c27c`.
- **Patches:** the two surgical `@livestore/*` bun patches were **removed**. Only
  `@effect/rpc@0.75.1` remains in `patchedDependencies` — **keep it**, it patches
  a different dependency (`RpcSerialization.js`) and is unrelated to the fork.
- **⚠️ Consequence:** plain `bun run dev` and any production build now run the
  **unpatched published snapshot — i.e. production has NO hibernation fix right
  now.** The fix currently exists only through the local clone (below). Closing
  this gap is the point of the roadmap.
- **Dev-loop mechanism is in place.** `LIVESTORE_LOCAL=1` (script: `bun run
  dev:local`) redirects every `@livestore/*` import to the local clone's source
  via Vite alias — works for `vp dev`, `test:unit`, and `test:e2e`. Off by
  default → published packages, unchanged.
- **The clone** lives at `local/livestore` (gitignored), checked out on the fork
  branch `bohdan/fix/do-hibernation-chain` @ `36dd15dac`, remote `fork` =
  `https://github.com/bohdanbirdie/livestore.git`, and is `pnpm install`-ed.
- **Wiring:** `tools/livestore-local.ts` (alias generator) consumed by
  `vite.config.ts`, `vitest.config.ts`, `vitest.e2e.config.ts`.

### How the mechanism works (summary)

- **No build step.** livestore's package `exports` point at `src/*.ts` (only
  `publishConfig.exports` use `dist/`); Vite transpiles the source on the fly.
- `tools/livestore-local.ts` reads each clone package's `exports` map and emits
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

| Option | Verdict |
| --- | --- |
| Hand-written or auto-generated **bun patch** | ❌ Size = the divergence (+96 commits), and it's a dist-level diff — huge and brittle. Auto-generating removes typing, not size. |
| **GitHub git-dependency** (`"@livestore/x": "github:…"`) | ❌ livestore is a `workspace:*` monorepo; the repo root isn't the package, cross-deps don't resolve outside the workspace, and packages need a build. |
| **Republish** to a registry | ❌ `@livestore` scope is owned by livestorejs; would require renaming to our scope or a private registry. Ruled out. |
| **Wait for upstream merge** + snapshot bump | Cleanest long-term, but "not always available" — can't be the standing strategy. |
| **Git submodule vendoring** | ✅ Chosen direction (below). |

## Target state: universal submodule vendoring (local == prod)

One source of truth, one mechanism, used by both dev and production — so **what
you test locally is exactly what ships**, closing today's "dev uses the clone,
prod uses the snapshot" gap.

**Design:**

- Add the fork as a **SHA-locked git submodule** at `vendor/livestore`
  (committed, reproducible, CI-clonable) — replacing `local/livestore` as the
  single source of truth.
- Generalize `tools/livestore-local.ts` to point at `vendor/livestore` and run
  **always-on by default**. Keep two escape hatches:
  - a flag to **force the published snapshot** (for A/B "is the bug mine or
    livestore's?"), and
  - an optional **path override** to point at an alternate local checkout for
    scratch experiments.
- The same Vite alias drives `vp dev` (local) and `vp build` (prod). At build
  time the fork source is **inlined into the worker bundle**; `wrangler deploy`
  ships that — no runtime dependency on the submodule.
- **CI gains a step:** `git submodule update --init` + `cd vendor/livestore &&
  pnpm install` before the build. cloudstash stays on bun; the submodule uses
  pnpm (same split as the raycast clone).
- **`wa-sqlite` / `sqlite-wasm` stay on the published snapshot** in both dev and
  prod. Safe here: PR #1338 doesn't touch them and the +96-commit drift changed
  `wa-sqlite` only trivially, so the skew is ≈ 0. (Building them from source
  drags in the emscripten/wasm toolchain — not worth it.)
- **`effect` dedupe stays.** Re-verify the fork's `effect` version matches
  cloudstash's on every fork bump (3.21.2 today).

**Why vendoring works where git-deps/tarballs don't:** the `workspace:*`
cross-deps resolve **inside** the vendored workspace (via its own `pnpm
install`), so there's no per-package version juggling.

## Migration plan (current → target)

1. **Add the submodule** pinned to the SHA you want to ship (currently
   `36dd15dac`):
   ```bash
   git submodule add -b bohdan/fix/do-hibernation-chain \
     https://github.com/bohdanbirdie/livestore vendor/livestore
   cd vendor/livestore && pnpm install
   ```
   Decide: keep `local/livestore` as a scratch override target, or remove it so
   the submodule is unambiguously the single source. Recommended: submodule only.
2. **Generalize `tools/livestore-local.ts`:**
   - Resolve the packages dir from an env path var (default
     `vendor/livestore/packages/@livestore`).
   - Make aliasing **on by default**; add a `*_PUBLISHED` flag to force the
     snapshot. Keep `EXCLUDE`, `dedupe`, and the `PLATFORM_CONDITIONS` skip
     exactly as they are.
3. **Wire CI:** submodule checkout + `pnpm install` in `vendor/livestore` before
   `vp build`. Ensure `pnpm` is available on the runner.
4. **Repo hygiene:** `vendor/livestore` is a committed submodule (not gitignored
   like `local/`). Update `.gitignore`/`scripts/sync-repos.sh` accordingly.
5. **Scripts:** decide whether `dev` defaults to the submodule and add a
   published-mode script (e.g. `dev:published`) for the A/B hatch.
6. **Validate before trusting prod:**
   - `bun run typecheck`, `bun run check`
   - `bun run test:unit` and `bun run test:e2e` (both default + published modes)
   - a real `bun run build`, then deploy to a preview and smoke-test the DO sync
     path **and** the browser store (the from-source build inlines all of
     livestore — broader surface than the published dist we ship today).
   - `bun run clean:local-state` first if the fork changed any DO SQLite schema.

## Gotchas / DO NOT

- **Keep** the `@effect/rpc@0.75.1` patch and its patch file.
- **Don't** build `wa-sqlite`/`sqlite-wasm` from source; keep them published.
- **DO schema changes in the fork are dangerous.** livestore versions its DO
  tables via the table *name* (`rpc_subscription_${PERSISTENCE_FORMAT_VERSION}`)
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

## To ship a new fork state (steady-state workflow, once migrated)

1. Develop in `vendor/livestore` (real fork checkout), push to the fork branch.
2. `git add vendor/livestore` in cloudstash to record the new SHA → that commit
   is what builds and deploys.
3. Run the validation suite (step 6 above) before deploy.

## References

- Mechanism + the three gotchas in depth: [[architecture/livestore-local-source-linking]]
- Fork: `bohdanbirdie/livestore`, branch `bohdan/fix/do-hibernation-chain`,
  upstream PR livestorejs/livestore#1338.

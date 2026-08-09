# Effect v4 migration + LiveStore submodule swap → upstream main

**Status:** planned (2026-08-09). **Execution plan lives in
[[todos/effect-v4-migration-progress]]** — a three-agent planning pass
(2026-08-09) produced the authoritative sequenced steps, cluster inventory,
and verification matrix there; this doc stays the strategy/rationale record.
Notable corrections from that pass: the real Effect surface is **205 files**
(182 `src/` + 19 `apps/extension/` + 4 `scripts/` — the extension workspace
was missing from the original count), and the v4 published snapshot is inside
the 7-day install cooldown until ~2026-08-16.

This is the unblock for the contributor loop:
all of our fork's functional work is merged upstream in reworked form, every
future livestore fix lands on the Effect-v4 codebase, and cloudstash can't
consume any of it until the app itself moves to Effect v4. Until then we are
pinned to a frozen fork and every upstream fix needs a hand backport.

## Why the swap and the migration are one atomic change

The vendored submodule shares one `effect` instance with the app
(`resolve.dedupe: ['effect']` in `tools/livestore-local.ts` — required for
`Context`/`Layer` identity). Vendor and app effect versions MUST match:

- upstream `main` catalog: `effect 4.0.0-beta.99` (flip commit `bcdf7a236`,
  2026-07-09)
- cloudstash: `effect 3.21.2`, imported by **177 files** in `src/`

There is **no sweet-spot upstream SHA**: the last pre-v4 commit (`eabb8feef`)
predates ALL the hibernation/recovery work (checked 2026-08-09 — no
`rpc_subscription` persistence, ws-rpc-server identical to the fork's base).
Pinning there would regress the ~1,300× idle-billing fix. So: submodule swap
and app migration land together, in one PR.

### Can Effect move first, without livestore? No — verified 2026-08-09

- **No official interop/compat layer exists.** The official migration guide
  ([effect-smol MIGRATION.md](https://github.com/Effect-TS/effect-smol/blob/main/MIGRATION.md))
  and the [v4 beta announcement](https://www.effect.website/blog/releases/effect/40-beta)
  treat the migration as wholesale; v4's whole design (one unified version
  number across the ecosystem, packages consolidated into core) assumes a
  single Effect per app. Nothing supports v3 and v4 coexisting.
- **Both orderings fail identically.** App-first: the vendored livestore still
  needs v3 — its public API types (`createStoreDoPromise`, sync layers, the
  `@livestore/utils/effect` facade) are v3-typed, so v4 values can't cross the
  boundary, and the `dedupe: ['effect']` singleton can't satisfy both.
  Livestore-first (submodule → upstream main): the mirror image. Two
  un-deduped copies is the exact failure class this repo has hit twice
  (effect dual-copy broke `Layer` identity; react dual-copy crashed prod,
  PR #80) — and here it wouldn't even typecheck.
- **The only theoretical incremental route** — a second aliased `effect@4`
  copy for leaf modules that never touch livestore — is not viable here:
  `AppLayerLive`/`OtelTracingLive` span every worker entrypoint, and the
  heaviest Effect consumers ARE the livestore-adjacent DOs. Two fiber
  runtimes + two OTel integrations for near-zero migrated surface.

**"At the same time" means one atomic landing, not one sitting.** The work is
staged on a long-lived flip branch (codemod sweep, then cluster-by-cluster
manual fixes with `bun run check` green per cluster); only the merge is atomic.

## Fork → upstream successor map (why zero carry remains)

| Fork commit | Upstream successor |
| ----------- | ------------------ |
| `f38fc7882` idle WS-RPC sync-DO hibernation | Completed upstream; livestorejs#1328 closed COMPLETED 2026-07-21, guarded by our #1427 (WS) + #1435 (DO-RPC) |
| `e64268662` DO-RPC live-pull survival (reap-on-client-verdict) | Reworked as #1541/#1542 (backend KV-persisted subscriber registry, keyed per client DO not per storeId) + #1544/#1545 (client-DO reconstruction recovery, closes livestorejs#1415) |
| `f9e685f2e`, `36dd15dac` (CI/lint) | Irrelevant |

After the swap the submodule points at `livestorejs/livestore` `main` directly —
no fork branch, no divergence, no `src/livestore-fork.d.ts` carry.

## Verified facts (2026-08-09)

- Upstream `main` HEAD = `2e4bcfc68` (the #1545 merge).
- npm `snapshot` dist-tag = `0.0.0-snapshot-2e4bcfc68f7ddad5696022a10d515a011f5f785a`
  — **exactly main HEAD**. The published-pin side (types for tsgo, wasm
  packages, `LIVESTORE_PUBLISHED=1` A/B hatch) has a ready v4 counterpart.
- Upstream package `exports` still point at `src/*.ts` → the
  `tools/livestore-local.ts` alias mechanism survives. New entrypoints exist
  (e.g. `@livestore/common/sync/next`) — the helper regenerates from the
  exports maps, but re-verify the wasm-exclusion and platform-conditional
  lists.
- Upstream catalog versions: `effect`, `@effect/platform-*`,
  `@effect/opentelemetry`, `@effect/vitest` all `4.0.0-beta.99`;
  `@effect/rpc` is **gone** from the catalog.
- cloudstash `@effect/rpc@0.75.1` patch is referenced **only** in
  `patchedDependencies` (no direct imports) → dies with the swap.
- cloudstash effect-family deps to move: `effect 3.21.2`,
  `@effect/opentelemetry 0.63.0`, `@effect/vitest 0.29.0`
  (`@effect/language-service 0.86.2` → newest compatible).

## Decision: migrate now on beta.99, don't wait for v4 stable

Rationale: the contributor loop is blocked today; livestore itself ships on
beta.99 (so the combination is exercised by upstream CI + examples); we pin the
**exact** beta from upstream's catalog and only bump when upstream bumps
(follow their `Upgrade Effect 4 cohort` commits), never chase betas
independently. Waiting for stable has unbounded latency and buys little —
the risky surface is our own 177-file migration, identical either way.

## Plan

### Phase 0 — prep (no behavior change, can start anytime)

- Official migration resources (all verified to exist 2026-08-09):
  - [MIGRATION.md](https://github.com/Effect-TS/effect-smol/blob/main/MIGRATION.md)
    — the per-area guide (Core, then Modules).
  - [migration/v3-to-v4.md](https://github.com/Effect-TS/effect-smol/blob/main/migration/v3-to-v4.md)
    — the import + API rename map (53 renames).
  - [effect-v3-to-v4 codemod](https://app.codemod.com/registry/effect-v3-to-v4)
    — JSSG codemod; classifies rewrites as deterministic / heuristic (verify)
    / warning (TODO markers). Run it as the opening commit of the sweep.
  - [v4 beta announcement](https://www.effect.website/blog/releases/effect/40-beta)
    — posture: "beta releases may include breaking changes"; stable will be
    LTS, no timeline; official codemods/AI migration skills deferred
    post-beta.
- Treat livestore's own migration commit series as the complementary
  playbook (see _API-change map_ below). (Their
  `contributor-docs/effect-4.md` checklist was internal design follow-ups,
  not a migration map — nothing to mine there.)
- Update `local/readonly-llm-lookup/effect` to the v4 branch so reference
  lookups match the target API. Note: `effect-solutions` guides may still be
  v3-flavored — verify per topic before trusting.
- Inventory our usage clusters: worker services/layers (`AppLayerLive`,
  `OtelTracingLive`), LinkProcessorDO pipeline, sync glue
  (`src/cf-worker/sync/`), Schema/data modeling, `@effect/vitest` tests.
- Check the 7-day supply-chain cooldown (`minimumReleaseAge`) against
  `effect@4.0.0-beta.99` publish date before the install day.

### Phase 1 — the flip branch (one PR, cluster-by-cluster commits)

1. Submodule: fetch upstream, pin to `main` (`2e4bcfc68` or newer), flip
   `.gitmodules` URL → `livestorejs/livestore`, `pnpm install` in
   `vendor/livestore`.
2. Deps — in BOTH workspaces (`package.json` **and**
   `apps/extension/package.json`, which carries its own `effect` + 5
   `@livestore/*` pins): `effect` → `4.0.0-beta.99` (exact parity with vendor
   catalog); `@effect/opentelemetry` + `@effect/vitest` → the catalog versions
   (vitest peer range `^3 || ^4` verified — our 4.1.7 stays). Bump all
   `@livestore/*` published pins → `0.0.0-snapshot-2e4bcfc68…`. Drop the
   `@effect/rpc` patch + `patches/` file.
3. `tools/livestore-local.ts`: regenerate/verify aliases against the new
   exports maps; keep `dedupe: ['effect', 'react', 'react-dom']` and the
   wasm exclusions; re-verify platform-conditional entrypoints.
4. Run the effect-v3-to-v4 codemod over `src/` as the opening commit (review
   its heuristic/warning classes by hand), then migrate the remainder cluster
   by cluster (see API-change map), keeping `bun run check` green per cluster
   (Effect language-service diagnostics do a lot of the work).
   `bun run typecheck` at the end, not per change.
5. ~~Drop `src/livestore-fork.d.ts`~~ — verified 2026-08-09: the file does
   not exist (the barrier revert removed it); `whenLeaderSynced` survives only
   in comments of `server-ingest-stranding.test.ts`. Instead: un-skip the
   stranding suites post-swap and decide whether upstream commit receipts
   (livestorejs#722) now provide the durability barrier
   ([[todos/server-ingest-cold-do-stranding]]).
6. DO state & schema: check upstream's `PERSISTENCE_FORMAT_VERSION` vs the
   fork's; fork prod DOs hold `rpc_subscription_7` (SQL, `generation` column)
   while upstream #1542 uses DO **KV storage** for the registry — verify no
   colliding `CREATE TABLE IF NOT EXISTS` names, orphaned fork tables are
   acceptable. Locally: `bun run clean:local-state` (user restarts the dev
   server).
7. Pick a new from-source build marker for
   `dist/cloudstash/index.js` — the old `grep -c "MAX(generation)"` check is
   fork-only and dies with the swap.

### Phase 2 — validation (the fork-integration checklist, v4 edition)

- `bun run check`, `bun run typecheck`, `bun run test:unit`,
  `bun run test:e2e`; a `LIVESTORE_PUBLISHED=1` pass against the v4 snapshot
  confirms the A/B hatch still works.
- Real `bun run build`; confirm the new from-source marker; preview deploy via
  the existing non-prod `wrangler versions upload` path; smoke DO sync
  (Telegram/Raycast ingest → LinkProcessorDO → SyncBackendDO → UI) **and** the
  browser store (OPFS client). The eviction e2e
  (`server-ingest-stranding.test.ts` incarnation probe) must still pass.
- After prod cutover: re-verify `type:hibernation` GB-s via the GraphQL
  observability method (see [[architecture/sync-backend-do-hibernation-billing]]),
  then remove the `liveLongTimers` probe (`src/cf-worker/sync/index.ts:23`).
- Re-verify react/react-dom dedupe in the prod bundle (the PR #80 dual-React
  crash class) after the vendor bump.

### Phase 3 — post-swap follow-ups

- Re-check the cold-DO **push-side** strand ([[todos/server-ingest-cold-do-stranding]])
  — expected still broken; the durable fix is upstream commit-receipt
  awaitables (livestorejs#722), now implementable directly on v4 as a
  contribution.
- Verify the DO-RPC stream-stall no longer reproduces
  ([[architecture/livestore-do-rpc-stream-stall]]) and close that item.
- Retire the fork branch on GitHub; update
  [[architecture/livestore-fork-integration]] status (it becomes "vendored
  upstream", not "vendored fork").
- Update memory/docs that say "fork" (livestore-local-source-linking).

## API-change map (livestore's own v4 migration commits, use as playbook)

`git log` these in `vendor/livestore` once on upstream main — each is a
self-contained pattern sweep:

- `c5e06a96a` Effect fork options
- `86edf7ec5` runtime contexts
- `000e8cb93` services
- `6174ab46d` logging configuration
- `4d4341347` scope types
- `207309154` `dual`/`constVoid` → `Function` namespace, `Predicate` refinements
- `88a4b993e` queue APIs
- `434b59cfa` unsafe method conventions
- `3b0326a93` `Effect.fork*` simplification
- `ddd1aa16c` **Date wire encoding on Effect 4** — check our livestore event
  schemas for Date fields; wire-format drift here would corrupt sync.

Headline v4 changes that will hit our 177 files (from the official rename
map):

- **Package consolidation:** `@effect/platform` → `effect/unstable/http|socket|process`,
  `@effect/rpc` → `effect/unstable/rpc`, `@effect/opentelemetry` →
  `effect/unstable/observability`. Caveat: livestore's catalog still pins an
  `@effect/opentelemetry@4.0.0-beta.99` package — at flip time, check which
  import style the vendored source actually uses and mirror it in
  `OtelTracingLive`/`AppLayerLive`.
- **Services/context:** `Context.Tag` → `Context.Service`; `FiberRef` →
  `Context.Reference`; `Runtime<R>` removed (re-scope the kanban item
  "Explore ManagedRuntime for LinkProcessorDO" after the flip).
- **Renames:** `Effect.async` → `callback`; `zipRight`/`zipLeft` →
  `andThen`/`tap`; `either` → `result` (type `Either` → `Result`);
  `catchAll*` → `catch*`; `Layer.scoped` → `Layer.effect`; `Mailbox` →
  `Queue`; Stream drops "Chunk" terminology for "Array"
  (`fromChunk` → `fromArray`, `mapChunks` → `mapArray`).
- **Behavioral:** Layer memoization changed across `Effect.provide` calls, and
  the fiber runtime is a rewrite — semantics, not just names; this is what
  Phase 2's e2e + preview smoke exist to catch.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Beta churn (announcement: "beta releases may include breaking changes") | Pin exact catalog versions; bump only when upstream's catalog bumps |
| Behavioral changes beyond renames (Layer memoization across `Effect.provide`, fiber-runtime rewrite) | Cluster-wise tests + full e2e + preview smoke before cutover |
| Date wire encoding / schema drift on the eventlog | `ddd1aa16c` review + e2e sync round-trip against a copy of real local state before prod |
| DO persistence-format mismatch on deployed DOs | Phase 1 step 6; worst case bump `PERSISTENCE_FORMAT_VERSION` |
| OTel exporter compat (`@effect/opentelemetry` beta on CF Workers) | Validate traces on preview before cutover |
| 177-file compile wall | Cluster-by-cluster commits, `bun run check` per cluster, language-service codemods |
| 7-day install cooldown on fresh betas | Check publish dates before starting Phase 1 |

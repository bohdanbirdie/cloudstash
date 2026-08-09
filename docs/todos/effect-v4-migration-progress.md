# Effect v4 + LiveStore upstream migration — progress tracker

**Status:** planned, not started (2026-08-09). Strategy + rationale live in
[[todos/effect-v4-livestore-upstream-migration]] — this doc is the living
tracker and the **authoritative execution plan**: check items off as they land
on the flip branch, log decisions and found issues at the bottom.

Filled 2026-08-09 by a three-agent planning pass (sequencing / inventory /
risk, independently researched, reconciled below).

## Reconciliation notes (where the agents differed or corrected the plan)

- **Ordering verdict: swap-first**, not app-first. The world flip (submodule +
  all dep pins, both workspaces) is commit 1; the codemod and all fixes happen
  against the true v4 target. Rationale in _Sequenced steps_.
- **Build marker:** adopt the Vite-define approach (matrix row 10:
  `__LIVESTORE_BUILD__ = "vendored@<sha>"` injected when the alias is active)
  over grepping upstream strings — self-describing and validates both A/B
  directions. The sequencing agent's `version: "0.4.0"` grep is the fallback.
- **`Schema.Date` count:** inventory found 30 hits in `src/livestore/schema.ts`,
  risk counted 18 inside synced-event schemas specifically. Recount during C3;
  the sweep covers all wire-visible ones either way.
- **Real Effect surface = 205 files** (182 `src/` + 19 `apps/extension/` + 4
  `scripts/`), not the 177 in the strategy doc — the extension workspace was
  missing from the original count and from the original plan entirely.
- **Hard blocker:** the v4 published snapshot `0.0.0-snapshot-2e4bcfc68…` was
  published 2026-08-09 — inside `bunfig.toml`'s 7-day `minimumReleaseAge`.
  **Open decision:** add `minimumReleaseAgeExcludes` for `@livestore/*`
  (defensible: SHA-pinned snapshot, same provenance as the submodule) vs wait
  until ≥ 2026-08-16. `effect@4.0.0-beta.99` (published 2026-07-17) is clear.

## Gates

- [ ] **G0 — prep done:** cooldown decision made, baselines captured,
  playbook commits skimmed
- [ ] **G1 — flip branch red→green:** world flip landed, codemod run, all
  clusters migrated, `bun run check` + `bun run typecheck` green
- [ ] **G2 — tests green:** `test:unit` + `test:e2e` (incl. eviction e2e +
  new wire-format tests), upstream hibernation suites in the submodule,
  `LIVESTORE_PUBLISHED=1` A/B pass
- [ ] **G3 — build + preview validated:** local `bun run build` + bundle
  asserts, preview deploy smoke (DO sync + browser store + extension compat)
- [ ] **G4 — prod cutover:** deploy, hibernation GB-s re-verified vs baseline,
  probe removed
- [ ] **G5 — follow-ups:** push-side strand re-checked, stream-stall item
  closed, fork retired, docs/memory updated

## Sequenced steps

**Verdict: (B) swap-first, with the entire world-flip (submodule SHA + `.gitmodules` URL + every dep pin) as one opening config-only commit, codemod immediately after.** The deciding factor is red-phase signal quality: in app-first ordering, `tsgo` resolves `@livestore/*` types from the still-v3 published snapshot while the app sits on effect v4 — bun installs a nested effect@3 to satisfy the snapshot's peer-deps, so every livestore-boundary file (sync glue, DOs, schema — exactly the highest-risk clusters) drowns in cross-instance "two different Effect types" noise, and any fixes made against those v3-typed APIs get redone after the swap because upstream reshaped those APIs in its own v4 sweep. Swap-first makes both levers (published pins for tsgo, submodule for runtime) point at the true v4 world from commit 1, so every subsequent red is a genuine migration task and the invariant *submodule SHA == snapshot pin SHA == effect version parity* holds at every commit on the branch — the red valley is unavoidable either way (the migration is atomic), but B's valley never contains a chimera state that could mislead a bisect or a reviewer. The codemod belongs *after* the flip, not before it, because its v4-idiom output is only checkable once v4 types are installed. Rebasability also favors B: the conflict-prone config files (package.json ×2, .gitmodules, bunfig, CI) are frozen in commit 1; the rebase-fragile codemod commit is kept pure (no manual edits) so it can be *regenerated* on a rebased base instead of conflict-resolved.

**Verified during planning (2026-08-09):** ① `bunfig.toml` has `minimumReleaseAge = 604800` and the v4 snapshot `0.0.0-snapshot-2e4bcfc68…` was published **today** (2026-08-09T11:35Z) — `bun install` will reject it until ~Aug 16 unless bunfig gets `minimumReleaseAgeExcludes` for the @livestore pins; `effect@4.0.0-beta.99` published 2026-07-17, clear. ② `@effect/vitest@4.0.0-beta.99` peers = `vitest ^3 || ^4` — our vitest 4.1.7 needs no bump. ③ Upstream `packageManager` is `pnpm@11.8.0` (fork: 11.3.0) — CI's pin and `ensure-livestore.sh`'s `npx pnpm@11.3.0` fallback must bump. ④ `PERSISTENCE_FORMAT_VERSION` is **7 on both sides**; upstream's registry lives in DO KV, not SQL, so no `CREATE TABLE` collision — orphaned fork `rpc_subscription_7` tables are acceptable, `eventlog_7_*` data survives. ⑤ The old marker's replacement can't be a negative grep on `0.0.0-snapshot` (current from-source bundle already has 5 hits from published wa-sqlite); adopt the Vite-define marker (matrix row 10). ⑥ `src/livestore-fork.d.ts` does not exist and never did — that strategy-doc step is a verify-only no-op; `whenLeaderSynced` appears only in comments of `server-ingest-stranding.test.ts`. ⑦ `apps/extension` is a second bun workspace with its own `effect 3.21.2` + 5 `@livestore/*` pins and 19 effect-importing files — **superseded 2026-08-09 (user decision): the extension workspace LAGS on v3 and migrates in a fast-follow PR**, see step 2 and C9. ⑧ App-direct `@effect/*` surface is tiny: `@effect/vitest` (39 test files), `@effect/opentelemetry` (2 files); zero `@effect/platform`/`@effect/rpc` imports.

1. [x] **Preflight + branch (no code changes).**
   Create `feat/effect-v4-livestore-upstream` off main. Resolve the cooldown
   decision (bunfig `minimumReleaseAgeExcludes` for `@livestore/*` vs install
   day ≥ 2026-08-16). Capture baselines: `bun run check:effect` error count
   (expect 0), the `[livestore] aliasing N entrypoints` count,
   `git -C vendor/livestore log -1`, and the day-before prod
   `type:hibernation` GB-s number. Skim the six upstream migration playbook
   commits (`c5e06a96a`, `86edf7ec5`, `000e8cb93`, `207309154`, `434b59cfa`,
   `ddd1aa16c`).
   **Done-when:** branch exists; cooldown decision in Decisions log; baselines recorded here.
   **Baselines (2026-08-09):**
   - `bun run check:effect`: **PASS — 572 files checked, 0 errors, 0 warnings, 0 messages.**
   - Livestore alias count: **41** — `[livestore] aliasing 41 entrypoints to vendor/livestore`
     (captured via `bun vitest run src/cf-worker/sync/__tests__/auth-payload.test.ts`, 10/10 green).
   - Submodule: `36dd15dacfd7c392f8fb186fcc47e4f091f9e40b` "fix: satisfy oxlint
     explicit-boolean-compare + format wrangler.toml"; `git status --short` clean;
     sole remote = fork (`bohdanbirdie/livestore`).
   - Playbook commits: all six resolve in the submodule's local history (no fetch needed):
     - `c5e06a96a` 2026-06-16 — chore!: migrate Effect fork options for v4
     - `86edf7ec5` 2026-06-16 — chore!: migrate Effect runtime contexts to v4
     - `000e8cb93` 2026-06-16 — chore!: migrate services to Effect v4
     - `207309154` 2026-06-16 — chore!: migrate `dual` and `constVoid` references to `Function` namespace and update `Predicate` refinements usage
     - `434b59cfa` 2026-06-17 — chore!: migrate unsafe method usage to Effect v4 conventions
     - `ddd1aa16c` 2026-07-18 — fix(events): preserve Date wire encoding on Effect 4 (#1436)
   - Prod hibernation GB-s: **PENDING — capture right before prod cutover (pre-G4).**
     `scripts/do-metrics.sh` is read-only and runs (auth in `.dev.vars`), but it only
     queries rowsWritten/rowsRead/WS-message-counts/cpuTime — no duration GB-s and no
     `type:hibernation` dimension. Reuse the GraphQL duration method from the
     2026-06-11 DO-duration incident for the real capture.

2. [x] **Commit 1 — the world flip (config only, zero `src/` changes).**
   (a) Submodule → livestorejs/livestore `main` @ `2e4bcfc68` (or newer — the
   published-pin SHA must be re-pinned to match), `.gitmodules` URL + branch
   flip, `git submodule sync`, manual `pnpm install` (outside-repo store;
   `ensure-livestore.sh` skips when node_modules exists). (b) Deps — ROOT
   workspace only (`apps/extension` lags on v3, fast-follow PR — user decision
   2026-08-09): `effect` + `@effect/opentelemetry` + `@effect/vitest` →
   `4.0.0-beta.99` exact; `@effect/language-service` → newest; the 8 root
   `@livestore/*` pins → `0.0.0-snapshot-2e4bcfc68…`; delete
   `patchedDependencies` + `patches/@effect%2Frpc@0.75.1.patch` (the LAST
   remaining bun patch — livestore patches already died with fork vendoring,
   PR #79; this empties `patchedDependencies`); `bun install`.
   **Extension-lag consequence:** `ci.yml` runs
   `bun --cwd apps/extension run compile`, and the extension imports
   `@web/livestore/schema` straight from `src/` — the moment C3 migrates
   `schema.ts` to v4 idioms, that CI step breaks. The flip PR must temporarily
   skip/gate the two extension CI steps; the fast-follow PR restores them. (c) Toolchain: pnpm
   11.3.0 → 11.8.0 in `.github/workflows/ci.yml` +
   `scripts/ensure-livestore.sh`; bunfig cooldown exclusion. (d) Verify the
   emitted alias-list diff (new entrypoints like `@livestore/common/sync/next`
   appear; wasm packages stay excluded; scan for NEW platform-conditional
   exports beyond `utils/cuid`). (e) `bun.lock` holds exactly one `effect`;
   re-verify react/react-dom dedupe (upstream pins react 19.2.3 vs our 19.2.6
   — the PR #80 crash class).
   **Done-when:** installs succeed; alias diff reviewed; one effect copy;
   `vp check` (lint/format) green; `check:effect` red count recorded as the
   burndown start.
   **Review gate — RG-flip (one subagent, checklist audit):** version parity vs
   upstream catalog; pin SHA == submodule SHA everywhere; patch fully gone;
   pnpm bumps present; bunfig exclusion scoped to `@livestore/*` only.
   **Executed (2026-08-09):**
   - Submodule: `livestorejs/livestore` `main` @
     `2e4bcfc68f7ddad5696022a10d515a011f5f785a` ("Merge pull request #1545 from
     livestorejs/bohdan/fix/do-rpc-client-recovery"), detached HEAD, tree clean.
     `.gitmodules` url → livestorejs, branch → main; `git submodule sync` run.
   - Vendor install: pnpm **11.8.0** (local pnpm resolves upstream's
     `packageManager` pin), `pnpm install --frozen-lockfile --store-dir
     ~/.pnpm-store-cloudstash-vendor`. First run aborted purging the fork-era
     node_modules (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`); clean success
     with `CI=true` (pnpm's documented remedy): 2600 packages, 11.7s, lockfile
     passes supply-chain policies. Engine warnings only (examples want node
     ≥24, local is v22.23.1).
   - Root deps set: `effect` + `@effect/opentelemetry` + `@effect/vitest` →
     `4.0.0-beta.99` exact; `@effect/language-service` → `0.87.2`; all 8
     `@livestore/*` pins → `0.0.0-snapshot-2e4bcfc68f7ddad5696022a10d515a011f5f785a`;
     `patchedDependencies` block + `patches/@effect%2Frpc@0.75.1.patch` deleted
     (patches/ now empty). `bun install` clean (129 packages; bun 1.3.14).
   - Alias list: `[livestore] aliasing 41 entrypoints` — **identical to the
     41 baseline**; no new entrypoints appeared (step (d)'s expected
     `@livestore/common/sync/next`-style additions did not materialize).
     `tools/livestore-local.ts` loaded against the upstream exports maps with
     zero errors, no changes needed. `auth-payload.test.ts` even passes 10/10
     under v4 unchanged.
   - `check:effect` burndown start: **218 errors, 204 warnings** (572 files).
   - Effect resolution: root `node_modules/effect` = 4.0.0-beta.99; root
     `node_modules/@effect/` = language-service + opentelemetry@beta.99 +
     vitest@beta.99 only; `apps/extension/node_modules/effect` = 3.21.2
     (expected lag). `bun.lock` holds exactly two effect resolutions (root
     beta.99 + `@cloudstash/extension/effect` 3.21.2); v3-era `@effect/*`
     (platform, rpc 0.75.1, cluster, sql, …) survive as lockfile entries for
     the extension's old-snapshot subtree only, physically confined to
     `node_modules/.bun/` store dirs (isolated linker) — not reachable from
     root.
   - React: root singleton 19.2.6 (`localflare/react` 19.2.4 is a nested
     dev-dashboard copy, not bundled); vendor has no top-level react — the
     dedupe assert stays a build-time check (matrix row 6).
   - pnpm pins 11.3.0 → 11.8.0 in `ci.yml` + `ensure-livestore.sh`; remaining
     `11.3.0` greps are docs-only (fork-integration doc; updated in the docs
     commit). Targeted `vp check` on the changed config files: pass.

3. [x] **Commit 2 — codemod sweep (pure, regenerable).**
   Run effect-v3-to-v4 codemod over `src/`, `apps/extension/`, `tools/`,
   `scripts/` (never `vendor/`); `vp check --fix` for formatting; NO manual
   fixes in this commit; record the exact invocation in the commit message.
   **Done-when:** diff == codemod output + formatting; error count drop
   recorded; warning-class TODO markers counted.
   **Review gate — RG-codemod (two independent subagents, one opus + one
   fable):** deterministic class = scale-anomaly skim; **heuristic class =
   both reviewers verdict every hunk, disagreements escalate**; warning class
   = triage into the cluster backlog, marker-count == backlog-count.
   **Executed (2026-08-09):**
   - Invocation (codemod CLI 1.13.19, package `effect-v3-to-v4@0.1.0` by
     sahilmob, default `EFFECT_V4_MODE=safe`), once per target dir — never
     repo root (keeps `apps/` + `vendor/` out of the walk):
     `npx codemod@latest run effect-v3-to-v4 -t <abs>/src --no-interactive`
     (then `-t <abs>/tools` and `-t <abs>/scripts`, each with
     `--allow-dirty`). `apps/extension` deliberately NOT swept (lags on v3).
   - Dry-run first (`--dry-run --no-interactive --no-color`, clean tree):
     src “Would modify 72 / Unchanged 489”, tools “0 / 7”, scripts “2 / 5”.
     Real runs matched exactly: 72 + 0 + 2 = 74 files.
   - Formatting: `bun run fix` (`vp check --fix`); it exits 1 with 126
     unfixable lint errors (red-valley expected, Stage 3 work). It also
     reformatted the two migration docs (repo-wide markdown formatter) —
     reverted via `git checkout -- docs/` to keep the commit pure.
   - `bun run check:effect`: **254 errors, 132 warnings** (baseline 218/204).
     Errors ROSE +36; warnings fell −72. Post-run mix: 252
     `missingEffectContext` + 2 `missingLayerContext` errors; 118
     `outdatedApi` + 14 other warnings. See Found issues.
   - TODO markers (`/* TODO(effect-v4-codemod): manual migration required for
     <rule-id> */`): **22 across 13 files** — rule-ids:
     `schema-optionalWith-manual` ×14, `effect-service-manual` ×5,
     `schema-transform-manual` ×3. Files: telegram/errors.ts (5),
     metadata/errors.ts (3), link-processor/errors.ts (3), queue-handler.ts
     (2), and 1 each in livestore/queries/schemas.ts, livestore/queries/
     links.ts, x-enrichment/generator.ts, x-enrichment/errors.ts,
     weekly-digest/generator.ts, settings/service.ts, metadata/schema.ts,
     billing/service.ts, admin/activity-stats/repo.ts.
   - Diff stat: **74 files changed, 741 insertions(+), 663 deletions(-)**;
     all 74 are `.ts` under `src/` (72) + `scripts/` (2); zero changes to
     package.json/bun.lock/configs/.github/drizzle/vendor/apps. Largest:
     billing/service.ts (+193/−182), admin/activity-stats/repo.ts (+88/−87),
     x-enrichment/generator.ts (+56/−55), weekly-digest/generator.ts
     (+51/−49), settings/service.ts (+38/−37).
   - Rewrite fingerprints (diff-grep, for RG-codemod): `Context.Tag` →
     `ServiceMap.*` (33 removed / 50 added, 17 files gained `ServiceMap`
     imports), `Effect.catchAll` → `Effect.catch` (19), `Effect.catchAllCause`
     → `Effect.catchCause` (17), `Effect.fork` → `Effect.forkChild` (5),
     `Schema.Union(…)` → `Schema.Union([…])` (3).
   **RG-codemod verdict (2026-08-09): dual ACCEPT with findings** (reviewer A
   = opus, reviewer B = fable, independent; convergent on the top findings).
   These are the **Stage 3 OPENING BACKLOG**, in priority order:
   1. [x] **`ServiceMap` → `Context` rename, 17 files / 33 conversions** — the
      codemod targets a stale v4 beta (ServiceMap era, renamed back to
      `Context` by beta.99). Shape (`X.Service<Self, Shape>()("id")`) is
      exactly right, all 33 identity strings preserved byte-for-byte —
      mechanical namespace rename. Root cause of the entire +36 error rise
      (both reviewers traced the `missingEffectContext` cascade to it).
   2. [x] **Restore `this.storeId!` at `link-processor/durable-object.ts:420`** —
      the sole purity violation in 74 files: the codemod's printer dropped a
      non-null assertion (twin at :372 kept it). Currently masked by the
      cascade; latent type error once the DO compiles.
   3. [x] **Finish the `TimeoutException` → `TimeoutError` rename pair**
      (reviewer B's catch): constructor converted in
      `process-link.test.ts:355`, but four dependents still key the OLD tag —
      `process-link.ts:346,349` (`catchTags({TimeoutException:…}`),
      `content-extractor.live.ts:36` (`Match.tag`),
      `ai-summary-generator.live.ts:20` (`catchTag`), `services.ts:20` (type
      ref). Left as-is, real v4 timeouts would silently skip the AI-summary
      timeout fallback. The half-applied-rename class the gate exists for.
   4. [x] **`tapErrorCause` → `tapCause`, 7 sites, no marker** (auth/index.ts:249,
      chat-agent/index.ts ×3, queue-handler.ts:155,
      workflows/account-deletion.ts:40, metadata/extractors/index.ts:28) —
      loud, but the codemod's coverage map missed it entirely.
   5. [x] **`forkChild` options decision, 5 sites in
      process-link-concurrency.test.ts** — sole reviewer disagreement:
      A flagged SUSPICIOUS (bare `forkChild` = lazy start + non-inherited
      interruptibility vs v3), B cleared contextually (all 5 are
      Deferred-synchronized). Resolution: set
      `{ startImmediately: true, uninterruptible: 'inherit' }` explicitly per
      upstream's own migration (vendor commit `c5e06a96a`), deliberately.
   Also for Stage 3's backlog (codemod's known non-coverage, all loud):
   `Effect.either`→`result` (~55 test sites), `Schema.TaggedError` (32 files,
   no markers — v4 shape TBD from vendor idiom), spread `Schema.Literal(...)`
   → `Literals` (5 sites), `Schedule.compose` (gone, 2 files),
   `Schema.headOrElse` (gone, livestore/queries/links.ts),
   `makeSemaphore`/`unsafeMakeSemaphore` naming (13), `Effect.runtime`/
   `Runtime.runPromise` bridge, `timeoutFail`.
   **Fixed (2026-08-09):** all five landed as Stage 3's opening unit.
   `check:effect` 254→**297 errors** / 132→**122 warnings** — the error RISE is
   cascade expansion again (see Found issues), every touched file improved or
   held. All five findings' API assumptions verified against beta.99 + vendor
   `c5e06a96a` with zero contradictions. Reviewer gate: ACCEPT with findings
   — scope purity exemplary (all 33 identity strings byte-verified), tapCause
   semantics probe-verified identical to v3 tapErrorCause on all four exit
   shapes, error-rise reproduced to the digit. Two accuracy notes: `vp check`
   on touched files has 15 pre-existing/transient reds (not clean — see Found
   issues), and the errorTag telemetry rename is observable;
   `auth-payload.test.ts` 10/10 green; `process-link-concurrency.test.ts`
   blocked at import by C8 harness debt (`Logger.withMinimumLogLevel` in
   `src/livestore/__tests__/test-helpers.ts`), not by the forkChild options.

4. [ ] **Commit 3 — C2 foundation: tracing, AppLayerLive, runtime, logging,
   core services.** `OtelTracingLive` is a rewrite, not a rename (v4 uses
   `OtelTracer.layerWithoutOtelTracer` style; keep the package import style
   the vendored source uses). Re-derive whether the `appLayerCache` /
   `billingLayerCache` WeakMaps are still needed under v4 memoization — or now
   harmful (stale `env` capture).
   **Done-when:** cluster diagnostic-clean; `vp check` green; count down.
   **Review gate — RG-cluster (one subagent, semantic checklist):** Layer
   memoization, `Layer.scoped`→`Layer.effect` finalizer semantics, service
   identity after `Context.Service`.

5. [ ] **Commit 4 — C8a test harness: `@effect/vitest` (39 files).**
   Makes per-cluster tests runnable for everything after; from here each
   cluster's done-when includes its vitest subset green.
   **Done-when:** one foundation-adjacent test file green end-to-end.

6. [ ] **Commits 5–7 — livestore-boundary clusters (highest risk).**
   (5) C3 schema/events — the Date-wire sweep + golden round-trip test IN THE
   SAME COMMIT (matrix rows 1–2). (6) C5 sync glue — leave the
   `liveLongTimers` probe in place; extend it to wrap `setTimeout` (matrix
   row 4). (7) C4 LinkProcessorDO pipeline.
   **Done-when per cluster:** diagnostic-clean + cluster tests green + count down.
   **Review gate — RG-cluster per cluster (alternate opus/fable):** schema
   reviewer gets `ddd1aa16c` as required reading; sync/LP reviewers get
   `88a4b993e` + `3b0326a93` and check Mailbox→Queue backpressure +
   hibernation-adjacent scope handling.

7. [ ] **Commits 8–N — C6 + C7 feature clusters, then frontend, then C9
   extension.** One commit per cluster; burn down warning-class backlog items
   as their cluster lands. Extension last (after C3 stable), gated by
   `bun run test:ext` + loading the unpacked extension.
   **Review gate — RG-cluster**, batching small clusters 2–3 per review.

8. [ ] **Commit N+1 — residual sweep to full green.**
   Clear remaining diagnostics + leftover TODOs; then the branch's first full
   `bun run typecheck` and `bun run test:unit`.
   **Review gate — RG-boundary (one fresh fable subagent):** whole-boundary
   review of `src/livestore/` + `src/cf-worker/sync/` + LP↔livestore glue
   against the upstream playbook — hunting v3 semantics that survived
   compilation.

9. [ ] **Commit N+2 — marker + docs.** Implement the `__LIVESTORE_BUILD__`
   define + post-build assert; update
   [[architecture/livestore-fork-integration]] (status → "vendored upstream")
   and the strategy doc.
   **Done-when:** marker documented; docs no longer claim fork-isms.

10. [ ] **Validation battery (fix-ups as small commits).**
    `bun run clean:local-state` (registry moved SQL→DO KV; user restarts the
    dev server). Then: `test:unit`, `test:e2e` (stranding incarnation probe
    passes), upstream hibernation suites inside the submodule
    (`tests/sync-provider/src/do-hibernation.test.ts` +
    `do-rpc-hibernation.test.ts`), `LIVESTORE_PUBLISHED=1` typecheck/build/
    test pass (near-noop is the assertion), real `bun run build` with marker
    = 1 and `LIVESTORE_PUBLISHED=1` build with marker = 0, bundle asserts
    (matrix rows 5–6), extension compat smoke (matrix row 8). Preview deploy
    ONLY via pushing the branch (Workers Builds `versions upload`) — never
    local remote wrangler.
    **Done-when:** every line has a recorded receipt (command + result) below.

11. [ ] **Final gate — full-diff review, rebase, merge.**
    Rebase on main (regenerate commit 2 via the recorded codemod invocation if
    it conflicts). **Two independent subagents (one opus, one fable) on the
    full branch diff** with disjoint mandates: A = correctness/behavioral
    (memoization, fiber semantics, Date encoding, DO lifecycle); B =
    completeness (banned-idiom greps all zero: `Effect.async(`, `zipRight`,
    `zipLeft`, `catchAll`, `Layer.scoped`, `Mailbox`, `fromChunk`,
    `mapChunks`, `FiberRef`, `Effect.either(`; no codemod TODOs; docs updated;
    every step-10 receipt exists). Both clean (or accepted-with-rationale) →
    merge. Post-merge: G4/G5 prod items per the strategy doc.

## Cluster checklist

Inventory taken 2026-08-09 against working tree (`main`, 8e36bf3). **Effect surface = 205 files**: 182 under `src/` (132 prod + 50 test), 19 under `apps/extension/`, 4 under `scripts/`. `@livestore/*` boundary: 28 files in `src/`, 6 in `apps/extension/`.

**Repo-wide grep counts (non-zero only).** Everything the rename map lists that scored **0** in this repo: `Effect.async`, `Layer.scoped`/`scopedDiscard`, `Mailbox`, `Stream.fromChunk`/`mapChunks`, `Chunk.`, `FiberRef`, `Context.GenericTag`, `ParseResult`, `DateTimeUtc`, `Effect.forkScoped`/`forkDaemon`, `Scope.` (src), direct `@effect/platform` / `@effect/rpc` imports. That kills a large slice of the official rename map before we start.

| pattern | hits / files | where |
| --- | --- | --- |
| `Schema.` (all) | 604 / 55 | `db/branded.ts`, `*/errors.ts`, `livestore/schema.ts` |
| `Layer.` (all) | 350 / 70 | `auth/service.ts`, `link-processor/durable-object.ts` |
| `Effect.provide` | 295 / 65 | `runtime.ts`, `billing/routes/runtime.ts`, DO files |
| `it.effect` | 361 / 33 | `src/cf-worker/**/__tests__` |
| `Effect.annotateLogs` | 218 / 54 | everywhere |
| `Layer.succeed` / `Layer.mergeAll` | 157 / 51, 125 / 29 | test layers + DO layers |
| `Effect.annotateCurrentSpan` | 131 / 37 | worker services |
| `Option.` | 125 / 28 | — |
| `Either.` | 109 / 14 | **src: 100% test files**; apps: `background.ts`, `messenger.ts` |
| `Match.` | 102 / 16 | `ui/tool.tsx`, `chat-agent/hooks.ts`, `connect/*` |
| `Effect.fn("name")` | 101 / 46 | `billing/service.ts` (9), `x-sync/*` |
| `Schema.TaggedError` | 99 / 31 | 31 `errors.ts`-style files |
| `Effect.runPromise` | 68 / 33 | 25 prod + 8 test files |
| `Effect.withSpan` | 65 / 30 | — |
| `Effect.either` | 55 / 14 | **all test files** → `Effect.result` |
| `catchTag(` / `catchTags(` | 47 / 17, 46 / 27 | `x-sync/effects.ts` (15), `connect/x.ts` (13) |
| `@effect/vitest` import | 39 files | unit + 1 e2e |
| `Schema.Defect` | 33 / 18 | TaggedError `cause` fields |
| `Context.Tag` declarations | 33 / 17 | see C2/C4/C6/C7 |
| `LogLevel.` / `Logger.withMinimumLogLevel` | 33 / 13, 30 / 12 | test helpers + `logger.ts` |
| **`Schema.Date` (wire)** | **30 / 1** | **`src/livestore/schema.ts` — every `Events.synced`** |
| `Deferred` | 29 / 1 | `__tests__/unit/process-link-concurrency.test.ts` |
| `catchAll(` / `catchAllCause(` / `catchAllDefect(` | 19 / 14, 17 / 7, 9 / 7 | — |
| `Schema.brand` | 18 / 1 | `db/branded.ts` (17 brands) |
| `Layer.effect` / `Layer.provideMerge` | 15 / 10, 14 / 7 | — |
| `Effect.gen(this, …)` | 15 / 4 | the 4 DO classes |
| **`Schema.DateFromNumber`** | **12 / 1** | `src/livestore/schema.ts` SQLite columns |
| `Effect.runSync` | 7 / 3 | `logger.ts` `logSync` shim |
| `Effect.unsafeMakeSemaphore` | 5 / 3 | `durable-object.ts` ×2, `process-link.ts`, test ×2 |
| `Logger.replace(Logger.defaultLogger, …)` | 4 / 3 | `logger.ts`, `link-processor/logger.ts`, `x-sync/durable-object.ts` |
| `ManagedRuntime` | 4 / 2 | **`apps/extension/` only** |
| `Effect.zipRight` / `zipLeft` | 3 / 2, 2 / 1 | trivial |
| `Schema.parseJson` | 3 / 2 | → `Schema.fromJsonString` |
| `Runtime.runPromise` + `Effect.runtime<R>()` | 1 | `workflows/account-deletion.ts:76` |
| `@effect/opentelemetry` | 2 / 1 | `src/cf-worker/tracing.ts` |
| `Stream.async` | 2 / 2 | `apps/extension` → `Stream.callback` |
| `Effect.runFork` | 2 / 2 | `sync/index.ts` |

- [ ] **C1 — Dep + vendor + build plumbing (12 files, M)** — both package.jsons, `.gitmodules`, submodule SHA, `tools/livestore-local.ts` (verify, likely no change), 3 vitest/vite configs, the `@effect/rpc` patch (delete), 4 Node scripts. Sharp edges: upstream pins react 19.2.3 vs our 19.2.6 (PR #80 dual-React class — re-verify dedupe); `apps/extension` does NOT go through `livestoreLocalResolve()` (consumes the published snapshot with its own effect copy — must bump same commit); `vitest.e2e.config.ts` `ssr.noExternal` lists `effect` + `@effect/` + `@livestore/` — re-check after consolidation. Order: **first** (= Sequenced step 2).
- [ ] **C2 — Worker core spine (23 files, L)** — tracing, `AppLayerLive`, runtime, logger, db/auth/settings/billing services. 3 `Context.Tag` here, 3 `Effect.Service`, the 2 `@effect/opentelemetry` imports, 17 `Schema.brand`. Sharp edges: `tracing.ts` is a rewrite (no drop-in v4 form); the two WeakMap layer caches (`runtime.ts`, `billing/routes/runtime.ts`) exist BECAUSE v3 memoization didn't span `Effect.provide` — v4 changed exactly this; `logger.ts` `logSync` runs `Effect.runSync` with only a Logger layer. Order: second.
- [ ] **C3 — LiveStore schema/events/queries + client store + frontend Effect surface (10 files, M — highest consequence)** — `src/livestore/schema.ts` (538L): 30 `Schema.Date` wire fields + 12 `Schema.DateFromNumber` columns; upstream `ddd1aa16c` proves v4 changed the Date wire form (their fix: `Schema.DateFromString.check(Schema.isDateValid())`). Events are immutable + persisted in prod eventlogs — needs the golden round-trip fixture (matrix rows 1–2) in the same commit. Order: third, before C4/C5/C7.
- [ ] **C4 — LinkProcessorDO pipeline + metadata (27 files, L)** — 8 `Context.Tag` in `services.ts`; `Effect.unsafeMakeSemaphore` ×3 (class fields crossing the non-Effect boundary); `liveLayer` of 7 merged layers rebuilt per link (memoization change lands here); 4 `catchAllDefect` recovery paths that null the cached Store. Order: after C2+C3, parallel with C5.
- [ ] **C5 — Sync backend glue (7 files, M — high blast radius)** — small API surface, all mechanical, but: `sync/index.ts` monkey-patches `setInterval` to prove the no-timer hibernation property — extend to `setTimeout` (v4 runtime may never call setInterval, blinding the probe); `getEventlogMax()` greps `eventlog_*` (verified unchanged at `2e4bcfc68`, re-verify at final SHA). Order: after C2, land with C4 as a pair.
- [ ] **C6 — HTTP surface: routes, connect, admin, invites, ingest, billing routes, account-deletion (42 files, L by volume)** — 11 `Context.Tag`; heaviest `catchTag` density (`connect/x.ts` 13, `connect/telegram.ts` 11); `Schema.parseJson` ×2 → `fromJsonString`. Sharp edge: `workflows/account-deletion.ts:76` is the repo's only `Effect.runtime<R>()` + `Runtime.runPromise` — bridges into CF Workflows `step.do()`; a wrong translation silently disables workflow retries. Order: after C2, parallel with C7.
- [ ] **C7 — Background feature workers: telegram, x-sync, x-enrichment, weekly-digest, chat-agent, queue-handler (50 files, L)** — 11 `Context.Tag` + 2 `Effect.Service`; highest `catch*` density (`x-sync/effects.ts` 15); `x-sync/durable-object.ts` `get baseLayer` rebuilds AppLayerLive per `runEffect` call — worst-case memoization exhibit; `telegram/bot.ts` reaches AppLayerLive only transitively (tracing convention holds only transitively). Order: after C2+C3.
- [ ] **C8 — Tests (96 test files; 39 import `@effect/vitest`, L)** — `it.effect` ×361; `Effect.either`→`result` (all 55 in tests); `Either.*`→`Result.*` (109, all tests). Sharp edges: `e2e/admin.test.ts` is the sole `@effect/vitest` × pool-workers intersection (needs a plain-vitest fallback if v4 vitest doesn't boot in workerd); `process-link-concurrency.test.ts` asserts scheduling ORDER — the fiber rewrite can change interleaving with zero API changes (expect debugging, not renames). Colocated tests ride their cluster's commit; harness + `__tests__/` bulk is its own commit.
- [ ] **C9 — Chrome extension `apps/extension/` (19 files, M) — now a FAST-FOLLOW PR, not part of the flip branch** (user decision 2026-08-09: lags on v3 briefly) — the repo's only `ManagedRuntime` ×2, `Stream.async` ×2 → `Stream.callback`, production `Either` → `Result`; own effect copy, no dedupe config, `bun:test` not `@effect/vitest`, NOT covered by root typecheck (`bun --cwd apps/extension compile`). CSP `script-src 'self' 'wasm-unsafe-eval'` — the msgpackr/eval class could resurface via v4's encoding modules. NOTE: lagging the source does NOT extend anything runtime-wise (the published artifact is a fixed v3 build either way), but matrix row 8's compat window closes only when a v4 build is published — which requires this migration. Don't lag long.

### Hotspots (careful hand-migration, in review-priority order)

1. `src/livestore/schema.ts` — Date wire encoding on immutable persisted events (golden fixture required).
2. `src/cf-worker/tracing.ts` — rewrite, gates every worker entrypoint via AppLayerLive.
3. `src/cf-worker/link-processor/durable-object.ts` (745L) — deepest layer nesting + unsafe semaphores + `Effect.gen(this,…)` + defect recovery, hit by memoization + naming + fiber changes at once.
4. `src/cf-worker/sync/index.ts` — the hibernation-billing gate; regression costs ~1,300× idle billing and shows in no test.
5. `src/cf-worker/runtime.ts` + `billing/routes/runtime.ts` — WeakMap layer caches vs v4 memoization (redundant or stale-env, wrong either way).
6. `workflows/account-deletion.ts` + `account-deletion/workflow.ts:76` — Runtime bridge into CF Workflows; mistranslation disables retries.
7. `x-sync/durable-object.ts` — per-call AppLayerLive rebuild; N clients per DO wake vs wrongly-shared across incarnations.
8. `__tests__/unit/process-link-concurrency.test.ts` — interleaving assertions vs the fiber rewrite.
9. `__tests__/e2e/admin.test.ts` — three-way pin: @effect/vitest beta × vitest × pool-workers.
10. `apps/extension/lib/runtime.ts` + `entrypoints/background.ts` — ManagedRuntime + own effect copy + zero root-typecheck coverage.

## Verification matrix

| # | Risk | Silent-failure mode | Concrete check | Gate |
|---|------|--------------------|----------------|------|
| 1 | v4 changed `Schema.Date` wire encoding (vendor `ddd1aa16c`) | v4 store fails to decode existing eventlog `args` (materializer ParseError), or writes an encoding v3 can't read after rollback; server stores `args` opaquely so no server error | Sweep wire `Schema.Date` → `Schema.DateFromString.check(Schema.isDateValid())`; audit the 12 `Schema.DateFromNumber` columns stay epoch-number. New `src/livestore/__tests__/event-wire-format.test.ts`: encode every event against **golden JSON captured on `main` (v3) first**; flip branch must pass identical goldens | G2 |
| 2 | Eventlog replay of real rows (both directions) | Goldens can miss fields; only real rows prove it | New pool-workers e2e `eventlog-format-compat.test.ts`: seed SyncBackendDO storage with fixture rows exported from `.wrangler/state/v3/do/cloudstash-SyncBackendDO/*.sqlite` (fork-written `eventlog_7_*` + `context_7` incl. `backendId`), boot LP client, assert materialized links + no `BackendIdMismatchError`. Reverse: flip-branch-written rows replayed on `main` **before** cutover | G2 |
| 3 | DO persistence format drift | A version bump (7→8) on a later pinned SHA silently orphans prod `eventlog_7_*` — v4 serves an empty log, clients fork | Verified at `2e4bcfc68`: version 7 both sides; upstream deleted `rpc_subscription_7` (clean orphan) → KV keys `rpc-sub:*`. **Hard checklist item keyed to the FINAL SHA:** `git -C vendor/livestore diff 36dd15dac <finalSHA> -- packages/@livestore/sync-cf/src/cf-worker/do/sqlite.ts packages/@livestore/sync-cf/src/cf-worker/shared.ts` — version still 7, table names unchanged | G2 |
| 4 | Hibernation regression from the fiber-runtime rewrite | Idle SyncBackendDO bills full residency again (~1,300×); nothing functional breaks | v4 `Effect.never` verified timer-less (`callback(constVoid)`); upstream parks on `Layer.launch`/`Stream.never`. Run upstream's `tests/sync-provider/src/do-hibernation.test.ts` + `do-rpc-hibernation.test.ts` in the submodule at the pinned SHA. Keep + **extend the `liveLongTimers` probe to wrap `setTimeout`**. Post-cutover: `type:hibernation` GB-s vs the day-before baseline | G2 + G4 |
| 5 | msgpackr eval under Workers CSP after dropping the `@effect/rpc` patch | First record-struct decode on the LP↔SB DO-RPC path throws "Code generation from strings disallowed" in prod only | Verified: effect v4 statically imports `msgpackr@2.0.4` (no `index-no-eval`), do-rpc still uses `RpcSerialization.msgPack`, BUT msgpackr 2.0.4 has a CF-Workers fallback (`inlineObjectReadThreshold = Infinity`). Checks: e2e do-rpc pass in workerd (codegen forbidden like prod); post-build `grep -c "inlineObjectReadThreshold" dist/cloudstash/index.js` ≥ 1 and `grep -c "msgpackr-extract" …` = 0; preview ingest smoke | G2 + G3 |
| 6 | Dual effect (or react) copies in the prod bundle | Broken `Context`/`Layer` identity at runtime only; typecheck green (PR #80 class) | Post-build assert **inside `bun run build`**: exactly one `moduleVersion = "` hit, zero `3.21.2` hits, react singleton grep | G2 |
| 7 | v4 global Layer memoization changes instantiation counts | Module-scope layers (`Billing.Default`, `AppSettings.Default`, `OtelTracingLive`) become per-isolate singletons; a service capturing request-1 context serves request-2 | Unit test: `Layer.effect` build-counter provided via two separate `Effect.runPromise(Effect.provide(…))` calls; assert + document the v4 count. E2e: two sequential authed requests in one isolate through billing/settings. Audit module-scope layers closing over `env` | G2 |
| 8 | Deployed v3 clients vs v4 server (published Chrome extension + open SPA tabs) | Extension/tabs silently stop syncing after cutover; saves queue local-only in OPFS | G3: run the current published extension against the preview backend — confirm clean local queuing; confirm the v4 extension build reads v3-written OPFS (`liveStoreStorageFormatVersion = 6` both refs — verified) and drains the queue. Submit the v4 extension to the Web Store **before** prod cutover. G4: watch push deliveries + extension errors through the window | G3 + G4 |
| 9 | Test harness self-destruction (`@effect/vitest` 0.29 → beta.99) | Tests pass vacuously or the pool won't boot | Peers verified compatible (`vitest ^3||^4`; ours 4.1.7; pool-workers peer `^4.1.0`). After the bump: temporarily flip one assertion per suite family to confirm failures still fail; full unit + e2e | G2 |
| 10 | From-source build marker died with the fork | Alias regression silently ships the published snapshot | Vite define when alias active: `__LIVESTORE_BUILD__ = "vendored@<sha>"`; post-build grep = 1, and = 0 under `LIVESTORE_PUBLISHED=1` (validates the marker itself) | G2 |
| 11 | OTel layer compile break (`@effect/opentelemetry` 0.63 → beta) | None at runtime — `OtelTracingLive` is currently a no-op (exporter disabled) | Typecheck against the beta subpaths or migrate to `effect/unstable/observability` (vendor re-exports `Otlp`). "Validate traces on preview" is vacuous until the exporter is re-enabled — separate post-swap item | G2 |
| 12 | Un-revertable side effects riding the flip PR | Rollback restores code but the deploy command's `d1 migrations apply --remote` already mutated D1 | **The flip PR must contain zero D1 migrations** (migrations-dir diff empty); anything needing D1 lands in a separate earlier PR | G2 |

### Rollback plan

A `git revert` of the flip PR (submodule pin back to `36dd15dac`, deps back to
effect 3.21.2, `@effect/rpc` patch restored) redeploys the fork build.
**Restored:** worker behavior, WS/do-rpc protocol, hibernation parks, bundle.
**Not restored / must stay compatible:**

- **Eventlog rows written by v4** (server, LP-DO, browser OPFS, extension
  OPFS) — readable by v3 only if the Date sweep held ISO encoding; matrix
  row 2's reverse-fixture run on `main` is the pre-cutover proof.
- **`context_7.backendId`** — unchanged by v4 (verify in the row-2 fixture) so
  rollback doesn't trigger fleet-wide `BackendIdMismatchError` re-pulls.
- **KV `rpc-sub:*` entries** written by v4 — invisible orphans to the fork;
  subscriptions re-establish via the app-level fetch trigger. The fork's stale
  `rpc_subscription_7` rows survive the interim and are re-read after
  rollback.
- **The published v4 Chrome extension cannot be rolled back** (store review
  latency) — after a server rollback it becomes the new-client/old-server
  mismatch. Accept local-queue degradation, or delay extension publish until
  prod has soaked.
- **D1 migrations** — excluded from the flip PR by matrix row 12.

## Decisions log

- 2026-08-09 — Migrate now on `4.0.0-beta.99` (pinned to livestore's catalog),
  don't wait for v4 stable. See strategy doc.
- 2026-08-09 — Atomic landing, staged work: one flip branch, cluster-by-cluster
  commits, multi-agent review gates (RG-flip, RG-codemod, RG-cluster,
  RG-boundary, final dual full-diff review) at the steps above.
- 2026-08-09 — **Ordering: swap-first (B).** World flip is commit 1; codemod
  and all fixes target the true v4 world. App-first rejected: chimera type
  environment (v4 app against v3-typed livestore snapshot) produces noise and
  rework in exactly the highest-risk clusters.
- 2026-08-09 — Build marker: Vite define `__LIVESTORE_BUILD__` (matrix
  row 10), replacing the fork's `MAX(generation)` grep.
- 2026-08-09 — **Cooldown: blanket temporary disable** (user decision):
  `minimumReleaseAge` commented out in `bunfig.toml` for the effect-v4/livestore
  flip (the v4 snapshot published 2026-08-09 sits inside the 7d window); restore
  it after Stage 1's install lands. Supersedes the scoped
  `minimumReleaseAgeExcludes` option.
- **OPEN** — extension publish timing: submit v4 extension before prod cutover
  (matrix row 8) vs after a soak period (rollback plan trade-off).
- 2026-08-09 — **Extension workspace lags on v3** (user decision): commit 1
  flips the root workspace only; `apps/extension` migrates in a fast-follow PR
  right after the flip merges (its two CI steps temporarily gated in the flip
  PR). Kept short because the published-extension compat window (row 8) only
  closes via a migrated + published v4 build.
- 2026-08-09 — **tsgo type-resolution claim verified**: `bun run typecheck` =
  `tsgo --noEmit`; `tsconfig.json` **excludes `vendor`** and has no
  `@livestore/*` paths, so types come from the published npm snapshot's
  `dist/*.d.ts` in node_modules; the submodule enters only via the Vite alias
  (runtime/bundling), which tsgo never reads. Hence the published-pin bump =
  the typecheck lever; submodule swap = the runtime lever.
- 2026-08-09 — **D1 verified clean**: migrations at `0013_lonely_giant_girl`
  (14 journal entries), tree clean, no pending/uncommitted migrations; the
  flip requires no schema change. Matrix row 12 stays as a guard against
  riders landing on main between now and the merge.

## Found issues

_(running list — every surprise found during migration gets a line here)_

- 2026-08-09 (planning) — `docs/todos/effect-v4-livestore-upstream-migration.md`
  step "drop `src/livestore-fork.d.ts`" was stale: the file doesn't exist;
  `whenLeaderSynced` survives only in comments of
  `server-ingest-stranding.test.ts`. Replaced with: un-skip the stranding
  suites post-swap + decide whether upstream #722 provides the durability
  barrier.
- 2026-08-09 (planning) — `apps/extension` was missing from the original plan
  and the original "177 files" count entirely (real surface: 205 files).
- 2026-08-09 (stage 0) — `scripts/do-metrics.sh` cannot capture the hibernation
  baseline: it queries rowsWritten/rowsRead/WS-message-counts/cpuTime only —
  no duration GB-s, no `type:hibernation` dimension. GB-s baseline left
  PENDING until pre-G4; reuse the GraphQL duration query from the 2026-06-11
  DO-duration incident.
- 2026-08-09 (stage 0) — `source .dev.vars` (the script's own documented
  usage) aborts before exporting `CF_ACCOUNT_ID` (line 22) — an earlier line
  in `.dev.vars` isn't shell-sourceable. Worked around by grep-extracting the
  two `CF_*` vars; the script then ran fine.
- 2026-08-09 (stage 1) — vendor pnpm install aborts without a TTY when it must
  purge a pre-existing node_modules (fork → upstream switch):
  `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. `CI=true` is pnpm's documented
  remedy and what CI/Workers Builds already set; harmless locally.
- 2026-08-09 (stage 1) — alias entrypoint count is **unchanged at 41** between
  fork base `36dd15dac` and upstream `2e4bcfc68` — the plan's expectation of
  new exports-map entrypoints (e.g. `@livestore/common/sync/next`) was wrong;
  `tools/livestore-local.ts` needed zero changes. RG-flip should still eyeball
  the full alias list diff, but there is none to review by count.
- 2026-08-09 (stage 1) — `auth-payload.test.ts` passes 10/10 under v4 with
  zero code changes (expected to fail): that file's surface
  (schema decode + payload shapes) is v3/v4-stable. Don't read it as "sync
  glue works" — `check:effect` still reports 218 errors repo-wide.
- 2026-08-09 (stage 1) — upstream workspace `engines` want node ≥24; local is
  v22.23.1 (warnings on example packages at install). May bite step 10 when
  running upstream's own test suites inside the submodule — check node version
  there first.
- 2026-08-09 (stage 2) — **check:effect errors ROSE after the codemod:
  218→254** (warnings fell 204→132). The expected drop happened only on the
  warning side (`outdatedApi` renames cleared); the error side is dominated by
  cascading `missingEffectContext`/`missingLayerContext` `any`/`unknown`
  diagnostics — half-migrated service/tag shapes (e.g. `ServiceMap` rewrites
  next to still-v3 neighbors) surface new per-usage-site errors. Not fixed
  here by design; Stage 3 burns it down.
- 2026-08-09 (stage 2) — codemod v0.1.0 scope gaps (its own remaining
  `outdatedApi` warnings, no manual analysis): `Effect.either` (55, all
  tests → `Effect.result`), `Effect.makeSemaphore`/`unsafeMakeSemaphore` (13),
  `tapErrorCause` (7), the effect-only `Effect.Service` shape (5, warned as
  `effect-service-manual`), `zipRight`/`zipLeft` (5), `timeoutFail` (1),
  `Effect.runtime` (1). Its pattern matrix covers `Schema.decode*Either →
  decode*Result` only — plain `Either.*`→`Result.*` (109 hits, C8) is NOT
  covered; stays hand-work.
- 2026-08-09 (stage 2) — codemod CLI's `--dry-run` prints counts only (no
  file list, no diffs); `-v` is engine debug noise. The modified-file list is
  only observable via the real run + `git status`. Dry-run counts matched the
  real run exactly (72/0/2).
- 2026-08-09 (stage 2) — `vp check --fix` formats repo-wide, not
  changed-files-only: it reformatted both effect-v4 docs
  (markdown list-indent + `*…*`→`_…_`). Reverted to keep commit 2 pure —
  expect those docs to reformat again on any future full `bun run fix`.
  (Stage 3 note: `bunx vp fmt <file>` scopes to one file — use that instead.)
- 2026-08-09 (stage 3, opening unit) — **check:effect errors ROSE again after
  fixing the RG-codemod backlog: 254→297** (warnings 132→122). Same cascade
  class as stage 2: with `ServiceMap` unresolvable in beta.99, all 33 service
  classes typed as `any`, suppressing diagnostics at every consuming site;
  the `Context` rename made the types real and expanded the analyzable
  surface. New errors sit exclusively in the services' dependents —
  `*.live.ts` impls + tests (stripe-routes.test 32→50, validate-payload.test
  0→16, runtime.test 0→4, source-auth.live 0→4, x-api-client.live 0→4) — while
  every file this unit touched improved or held (chat-agent 6→3, LP
  durable-object 5→2). Expect the count to keep breathing until the cluster
  commits land; per-file deltas, not the total, are the burndown signal.
- 2026-08-09 (stage 3) — beta.99 API verification found zero contradictions
  with the RG-codemod findings: `Context.Service<Self, Shape>()("id")`
  (node_modules/effect/src/Context.ts, documented example ~l.185; matches
  vendor `leader-thread/types.ts:88`), `Effect.timeout` fails with
  `Cause.TimeoutError` (`_tag: "TimeoutError"`; the `TimeoutException`
  mentions surviving in Effect.ts are stale doc comments only),
  `Effect.tapCause` same cause-callback shape as v3 `tapErrorCause`,
  `forkChild` options `{ startImmediately?: boolean; uninterruptible?:
  boolean | "inherit" }` — exactly the literals vendor `c5e06a96a` uses.
- 2026-08-09 (RG review of the corrections unit) — the restored `storeId!` at
  `link-processor/durable-object.ts:420` trips oxlint
  `no-unnecessary-type-assertion` (a TRANSIENT: `this` inside
  `Effect.gen(this, …)` currently resolves to `any` there, so the assertion
  looks redundant; it becomes necessary once the gen typing lands in C4). Do
  NOT revert — the twin at :372 shows the correct end state. Self-resolves;
  +1 red on the already-red `vp check` gate.
- 2026-08-09 (RG review) — telemetry note: the `errorTag` value
  `"TimeoutException"` → `"TimeoutError"` flows into
  `Effect.annotateCurrentSpan`/`annotateLogs` (process-link.ts) — any saved
  log/trace query filtering the old tag silently stops matching. Not
  persisted to D1/eventlog; no data migration needed.
- 2026-08-09 — Effect language-service v4 integration confirmed accounted
  for: `@effect/language-service@0.87.2` auto-detects the installed Effect
  major and switches rule sets (v3-only rules off, v4 `outdatedApi` on) — no
  config change needed; the same package serves both the `check:effect` CLI
  and the editor tsserver plugin. Editor needs a TS-server restart after the
  dep bump to load the new plugin version.

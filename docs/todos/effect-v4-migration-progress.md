# Effect v4 + LiveStore upstream migration — progress tracker

**Status:** IN FLIGHT (2026-08-10) — Stage 3 COMPLETE (residual sweep
committed after user review), gate G1 closed, Stage 4 validation battery
IN FLIGHT. Strategy + rationale
live in [[todos/effect-v4-livestore-upstream-migration]] — this doc is the
living tracker and the **authoritative execution plan**: check items off as
they land on the flip branch, log decisions and found issues at the bottom.

Filled 2026-08-09 by a three-agent planning pass (sequencing / inventory /
risk, independently researched, reconciled below).

## SESSION HANDOFF (2026-08-10) — resume exactly here

**Working state:** branch `feat/effect-v4-livestore-upstream`, HEAD = the
extension-gates commit (E2, child of the E1 extension migration
`583ddaf`), pushed — **PR #82** open. Stages 0–4 COMPLETE (G0–G3 closed;
G3's preview smoke waived by user decision — see the gate note), Stage 5's
final dual review EXECUTED with its fix batch committed (`3e45680`), and
the EXTENSION ADDENDUM landed 2026-08-10: the user REVERSED the
stacked-PR decision — `apps/extension` is migrated to v4 + upstream pins
IN THIS PR (E1 `583ddaf`: executor + independent reviewer APPROVE, compile
clean, test:ext 11/11, build:local green, lockfile evicts the entire
v3/fork subtree; user granted full-trust autonomy for the extension
stages, migration-only constraint — zero functionality change) and the
gates flipped back (E2: 3 CI steps restored, publish-extension guard
removed). CI GREEN on `03f3215` (E2b cooldown-excludes fix — the first
E2 run failed frozen install, see decision #1's correction): quality +
test + Workers Builds all pass, with the three extension steps
(postinstall/compile/test:ext) confirmed EXECUTED on the runners.
**Branch is MERGE-READY.**
Remaining: optional pre-G4 hibernation GB-s baseline (user's CF auth) →
merge PR #82 (no rebase needed — main unmoved at `8e36bf3`; re-check at
merge) → G4 cutover per the documented expectations (schema-hash warn
spam + one-time rematerialization per client store; watch chat-agent
live-pull + the still-published v3 extension until the Web Store
re-publish) → post-G4: GB-s vs baseline, remove `liveLongTimers` probe,
Web Store publish (user-triggered). Last full battery on `ed89bfd`
(Reviewer B, independent): check 0/0/0, typecheck 0, unit **1292/1292**,
e2e **7 files / 53 passed / 3 pre-existing skips**, build 5/5 asserts,
upstream hibernation suites **2/2 on node 22**.

**RESOLVED (2026-08-10, post-compact):** the user's "not sure it's clean
enough" concern about the chat-agent single-flight guard was settled by
collapsing the two-field shape (`cachedStore` + `storeCreationPromise`)
into ONE memoized-promise field: `storePromise: Promise<Store> | null` on
`ChatAgentDO` (`src/cf-worker/chat-agent/index.ts`). Same single-flight
guarantee (concurrent callers share one `createStoreDoPromise` — PR-#30
class stays closed), half the state, no try/finally dance; the promise is
cleared only on rejection (guarded self-check) so failures retry;
`purgeAll` nulls it; `syncUpdateRpc(payload, storeId)` awaits
`getStore(storeId)` unconditionally (memo makes the warm path a no-op).
Follow-up queued in Stage 6: migrate LinkProcessorDO's two-field guard
(`link-processor/durable-object.ts:74`) to the same idiom. User approved
2026-08-10; landed in the Stage-3-closing residual-sweep commit (child of
`c919c1f`), full battery green on the committed tree (check, typecheck,
unit 1292/1292, e2e 52/3-skip).

**Open decisions — ALL RESOLVED 2026-08-10 (user):**

1. Bunfig `minimumReleaseAge` — RESTORED at the full 604800 on the PR
   branch, same day. **Correction 2026-08-10:** the "lockfile-safe"
   verification held only for UNCHANGED package.json entries — E1's five
   new `apps/extension` `@livestore/*` pins re-resolve on a cold cache,
   so the first E2 CI run failed all three checks at `bun install
--frozen-lockfile` (locally masked by the warm bun cache; reproduced
   with `BUN_INSTALL_CACHE_DIR=<fresh>`). Fixed as decision #1 always
   anticipated: `minimumReleaseAgeExcludes` in `bunfig.toml` listing the
   8 first-party `@livestore/*` pins (same SHA as the vendored
   submodule; a `"@livestore/*"` glob does NOT work in bun 1.3.14 —
   explicit names required). Cold-cache frozen install verified green.
   The exclude is PERMANENT, not temporary: snapshot pins are always
   freshly published, so the age gate can never pass them — this also
   un-blocks future snapshot bumps.
2. Extension: ~~migration = STACKED PR after this one (Stage 6)~~ —
   REVERSED 2026-08-10 (user): migrated IN THIS PR (E1 `583ddaf` + E2
   gates; full-trust autonomy granted for the extension stages,
   migration-only constraint). Web Store publish still post-merge
   whenever — review latency (weeks) accepted.
3. `DeletionRuntimeError` message-getter — DONE in this PR. Determined
   migration-introduced (v3 `Runtime.runPromise` rejected with a
   FiberFailure whose message embedded the pretty cause; v4
   `runPromiseWith` rejects with the typed error whose message is empty —
   probe-verified), so per the user's rule it rides the migration.
   `override get message()` added to BOTH `DeletionRuntimeError`
   (`op/step: cause`) and `WorkflowOrchestrationError` (`step: cause`);
   prototype getter works because the v4 ctor sets no own `message`
   (probe-verified); account-deletion tests 32/32 untouched.
4. Account-deletion purge-ordering swap — FILED to `docs/kanban.md` Todo
   (2026-08-10) as a follow-up task; out of this PR's scope.

**Stage 4 — local battery DONE 2026-08-10 (all receipts in the _Step 10
receipts_ section):** full battery green on `265fd3e` (check clean,
typecheck 0, unit 1292/1292, e2e 53/3-skip with the new probe); upstream
hibernation suites PASSED in the submodule (2/2 — the
node ≥24 caveat did not bite, no engines gate on the test package); matrix
row 7's e2e WRITTEN and green (new
`src/cf-worker/__tests__/e2e/layer-memoization.test.ts`, slimmed post-RG
to its one genuine detector: services rebuild per top-level provide of the
memoized layer); `bun run build` verify-bundle all-pass (marker
`vendored@2e4bcfc68` ×1, `3.21.2` ×0, msgpackr fallback ×3, react
`[19.2.6]` singleton); extension compat smoke's locally-automatable share
done (server-surface suites 115/115, response-shape contract match,
storage-format-6 parity, WS-schema statics between extension pin
`6e9abadf4` and `2e4bcfc68`).
~~`LIVESTORE_PUBLISHED=1` full A/B pass~~ — DROPPED (user decision
2026-08-10): fork-era rationale is dead (published pins == submodule SHA,
the published lane never ships, "mine or livestore's?" A/B is meaningless
on identical code); the marker's bidirectional self-validation was already
receipted in step 9 and the `bun run build` marker assert covers silent
alias regression on every build.
**Stage 4 closed out (2026-08-10):** branch PUSHED, **PR #82** open; G3
preview smoke WAIVED (user decision — see the G3 gate note; chat-agent
live-pull + the published-v3-extension WS envelope became G4 watch items);
`clean:local-state` proven UNNECESSARY by the user's local manual smoke
(the cutover dress rehearsal in Found issues — fork-written state opens
clean under upstream v4). Still pending pre-G4: capture the hibernation
GB-s baseline (GraphQL duration method from the 2026-06-11 incident doc;
`scripts/do-metrics.sh` can NOT produce it). Post-G4: remove the
`liveLongTimers` probe, re-verify GB-s vs baseline.

**Stage 5 (in flight 2026-08-10):** main UNMOVED since branch (merge-base
= `8e36bf3` — no rebase needed; re-check at merge); final DUAL full-diff
review EXECUTED — Reviewer A (fable, correctness): **MERGE-READY, zero
unrecorded behavior deltas** (high-risk claims probe-confirmed); Reviewer
B (opus, completeness): mechanically clean core, findings F1–F11 →
dispositions in step 11's Executed block; fix batch applied same day and
committed (`3e45680`), extension addendum E1/E2/E2b followed with CI
green on `03f3215`. Remaining: merge PR #82 = atomic landing.

**Stage 6 fast-follows (already queued):** Web Store publish of the
migrated extension (user-triggered, post-merge); `bun update wxt` (dedupes
the leftover nested `wxt/vite@8.0.3`); upstream #722 commit-receipts
contribution (cold-DO push-side strand — re-check confirmed still
unfixed); retire the fork branch on GitHub; update memory files (fork →
vendored upstream); migrate LinkProcessorDO's two-field store guard
(`link-processor/durable-object.ts:74`) to ChatAgentDO's single
memoized-promise idiom.

**Working protocol (user-mandated, unchanged):** cycle = I delegate to a
subagent (Fable executors; Fable/Opus reviewers) → independent RG review →
USER reviews the diff → only then I commit → next delegation. Subagents
NEVER commit. Tests prime directive: API-form only, assertion changes need
explicit user sanction (exactly one granted so far). All commits so far:
`d68f762` docs → `39aa07e` world flip → `99be60f` codemod → `cafff12` docs
→ `bd09696` corrections → `8ea6c20` C2 → `3242c4e` C8a → `738140b` C3 →
`df85467` C5+C4 → `5496fd7` C7 → `c919c1f` C6 → `265fd3e` residual sweep
(closes Stage 3/G1) → `e5c099e` Stage-4 battery (closes G2) → `ed89bfd`
parked decisions → `3e45680` final-review fix batch (closes Stage 5's
review fixes) → `583ddaf` extension E1 (apps/extension → v4 + upstream
pins) → `fea8f75` extension gates E2 → `03f3215` cooldown excludes E2b
(CI green, extension steps live).

## Progress at a glance

Cycle per unit: Fable/Opus executor subagent → independent reviewer subagent
→ user review → commit. No subagent ever commits.

| Stage                                             | Status | Commits               |
| ------------------------------------------------- | ------ | --------------------- |
| 0 — Preflight (branch, cooldown, baselines)       | ✅     | `d68f762`             |
| 1 — World flip (submodule + deps, config only)    | ✅     | `39aa07e`             |
| 2 — Codemod sweep (pure) + dual RG review         | ✅     | `99be60f` + `cafff12` |
| 3 — Cluster burndown (~8 units)                   | ✅ 8/8 | below                 |
| 4 — Validation battery                            | ✅     | `e5c099e`             |
| 5 — Final dual review + rebase + merge            | 🔄     | `3e45680`             |
| 5b — Extension addendum (E1/E2/E2b, CI green)     | ✅     | `583ddaf`…`03f3215`   |
| 6 — Fast-follows (#722, publish, fork retirement) | ⬜     |                       |

Stage 3 units: RG-codemod corrections ✅ `bd09696` · C2 foundation ✅
`8ea6c20` · C8a test harness ✅ `3242c4e` · C3 schema/Date-wire ✅ `738140b`
· C5+C4 sync glue + LinkProcessorDO ✅ `df85467` · C6
HTTP surface ✅ `c919c1f` · C7 background workers ✅
`5496fd7` · residual sweep + typecheck milestone + marker/docs ✅
`265fd3e` — CLOSES Stage 3 + gate G1.
C9 extension: REMOVED from this PR (Stage 6 fast-follow, user decision;
all three extension CI steps incl. `test:ext` TEMP-gated as of the C3
commit). **Corrected 2026-08-10 (final-review F1):** its 4/11 test
failures are NOT pre-existing — they are INTRODUCED by this branch: 4
extension files import root `src/` through the `@web` alias (incl. the
v4-rewritten `src/livestore/schema.ts`, whose `DateFromMillis`/`.check()`
don't exist in effect 3.21.2), so `apps/extension` is dual-instance and
UNBUILDABLE in-tree until the fast-follow. `publish-extension.yml` now
carries a fail-fast guard (F2) so a manual dispatch can't ship it.
**RESOLVED 2026-08-10 (extension addendum):** the fast-follow was pulled
INTO this PR — E1 `583ddaf` migrates all 15 extension files + pins
(effect 4.0.0-beta.99, five `@livestore/*` → `2e4bcfc68`; executor +
independent reviewer APPROVE; compile clean, test:ext 11/11, build:local

- check green; single hoisted effect copy dissolves the dual-instance
  hazard), E2 restores the 3 CI steps and deletes the publish guard. F1/F2
  CLOSED.

`check:effect` burndown: 0 (pre-flip) → 218 (flip) → 254 (codemod) → 297
(corrections; rises = unmasking) → 272 (C2) → 144 (C8a) → 144 (C3 — total
flat by construction: C3's debt was runtime-only, invisible to check:effect;
zero diagnostics anchored in any C3 file before or after) → **121 errors /
19 warnings (C5+C4; in-scope anchored 35 → 1, and that 1 residual —
durable-object.ts:396 — is rooted in out-of-cluster C7 `Effect.Service`
declarations poisoning `liveLayer`, zero debt in cluster code)** → **36
errors / 8 warnings (C7; zero anchored in any C7 file, and the C4
residual at durable-object.ts:396 CLEARED — the 44 remaining diagnostics
anchor in C6 prod files + their consuming test files — 17 of them in
stripe-routes.test + ingest-service.test)** → **0 errors / 0 warnings
(C6 — BURNDOWN COMPLETE, zero repo-wide)**. Unit tests: 566/652 → 849/867 → 891/909 →
**1173/1191 passing (C7; +282 newly runnable, +277 newly green; all 18
reds + 9 import-dead suites are C6-boundary — category (c) BEHAVIOR is
EMPTY, hotspot-8 process-link-concurrency PASSED 4/4 on its first-ever
v4 run)** → **1290/1292 (C6; total grew 1191→1292 because the 9
import-dead suites now register their full test counts; the ONLY 2 reds
are category (c) — workflow.test.ts `String(error.cause)` assertions,
see Found issues)** → **1292/1292 (residual sweep; the 2 category-(c)
reds fixed via the SANCTIONED assertion strengthening — the migration's
only assertion change)**. E2e (FIRST v4 run): **6/6 files, 52 passed /
3 skipped** (skips = the pre-existing `describe.skip` durability suites
from the stranding post-mortem #81); the eviction/incarnation probe
PASSED; re-confirmed identical on the residual-sweep unit. Typecheck:
UNSTABLE 7/94/73/0 (C6 bonus runs) → characterized (4 sequential runs =
identical 73) → **STABLE ZERO, 3 consecutive clean runs** (dual-identity
cliffs removed — see the 2026-08-10 Decisions + Found issues).
`bun run check`: full chain green (lint 0/0, check:effect 0/0).

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

- [x] **G0 — prep done:** cooldown decision made, baselines captured,
      playbook commits skimmed (2026-08-09)
- [x] **G1 — flip branch red→green (2026-08-10):** world flip landed, codemod run, all
      clusters migrated, `bun run check` + `bun run typecheck` green
- [x] **G2 — tests green (2026-08-10):** `test:unit` 1292/1292 + `test:e2e`
      7 files / 53 passed / 3 pre-existing skips (incl. eviction e2e +
      wire-format tests + row-7 probe), upstream hibernation suites in the
      submodule 2/2 on node 22 (`LIVESTORE_PUBLISHED=1` A/B pass dropped —
      user decision 2026-08-10, see Stage 4 note in the handoff section)
- [x] **G3 — build validated; preview smoke WAIVED (2026-08-10, user
      decision):** local `bun run build` + all 5 bundle asserts green; the
      Workers Builds preview smoke is skipped — no proper staging
      environment (preview lacks real DO/D1/queue state) and no users, so
      the risk is accepted. Consequence: chat-agent live-pull and the
      published-v3-extension WS envelope ship review-verified-only →
      explicit G4 watch items (first real chat session + extension sync
      after cutover).
- [ ] **G4 — prod cutover:** deploy, hibernation GB-s re-verified vs baseline,
      probe removed
- [ ] **G5 — follow-ups:** push-side strand re-checked, stream-stall item
      closed, fork retired, docs/memory updated

## Sequenced steps

**Verdict: (B) swap-first, with the entire world-flip (submodule SHA + `.gitmodules` URL + every dep pin) as one opening config-only commit, codemod immediately after.** The deciding factor is red-phase signal quality: in app-first ordering, `tsgo` resolves `@livestore/*` types from the still-v3 published snapshot while the app sits on effect v4 — bun installs a nested effect@3 to satisfy the snapshot's peer-deps, so every livestore-boundary file (sync glue, DOs, schema — exactly the highest-risk clusters) drowns in cross-instance "two different Effect types" noise, and any fixes made against those v3-typed APIs get redone after the swap because upstream reshaped those APIs in its own v4 sweep. Swap-first makes both levers (published pins for tsgo, submodule for runtime) point at the true v4 world from commit 1, so every subsequent red is a genuine migration task and the invariant _submodule SHA == snapshot pin SHA == effect version parity_ holds at every commit on the branch — the red valley is unavoidable either way (the migration is atomic), but B's valley never contains a chimera state that could mislead a bisect or a reviewer. The codemod belongs _after_ the flip, not before it, because its v4-idiom output is only checkable once v4 types are installed. Rebasability also favors B: the conflict-prone config files (package.json ×2, .gitmodules, bunfig, CI) are frozen in commit 1; the rebase-fragile codemod commit is kept pure (no manual edits) so it can be _regenerated_ on a rebased base instead of conflict-resolved.

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

4. [x] **Commit 3 — C2 foundation: tracing, AppLayerLive, runtime, logging,
       core services.** `OtelTracingLive` is a rewrite, not a rename (v4 uses
       `OtelTracer.layerWithoutOtelTracer` style; keep the package import style
       the vendored source uses). Re-derive whether the `appLayerCache` /
       `billingLayerCache` WeakMaps are still needed under v4 memoization — or now
       harmful (stale `env` capture).
       **Done-when:** cluster diagnostic-clean; `vp check` green; count down.
       **Review gate — RG-cluster (one subagent, semantic checklist):** Layer
       memoization, `Layer.scoped`→`Layer.effect` finalizer semantics, service
       identity after `Context.Service`.
       **Executed (2026-08-09):**
   - `check:effect`: 297→**272 errors**, 122→**111 warnings**. Cluster-anchored
     diagnostics 21→**5** — and all 5 residuals are rooted in exactly two
     OUT-of-cluster v3 declarations (boundary blockers below), zero in the
     cluster's own code.
   - Decision outcomes (details in Decisions log): (1) tracing.ts →
     `OtelTracer.layerGlobal` + `Resource.layer` (module rename only; config
     shape unchanged; still no-op — global provider unregistered).
     (2) WeakMap caches KEPT-harmless; their v3-era justification was never
     true (both v3 3.21.2 and beta.99 build a fresh MemoMap per top-level
     `Effect.provide` — verified in both sources); comments corrected.
     (3) TaggedError pattern set: `Schema.TaggedErrorClass<Self>()("Tag", f)`
     with identifier omitted (vendor's `~pkg/X` identifier form would rename
     `error.name` — observable via `safeErrorInfo`); `Schema.Defect` →
     `Schema.Defect()`; `Schema.Literal(...arr)` → `Schema.Literals(arr)`;
     16 error classes across 8 cluster files migrated (RG-corrected count). (4) Effect.Service
     pattern set: hoisted `const make` + `Context.Service<Self,
Effect.Success<typeof make>>` + `static readonly Default =
Layer.effect(Self, make)` — preserves the `.Default` contract so the 4
     consuming files (3 in other clusters) need zero changes; settings +
     billing migrated, markers removed; activity-stats/repo NOT blocking C2,
     left for C6. (5) `Schema.brand` ×17: **no change needed** — beta.99
     brand/`.Type`/`.make` are v3-identical; db/branded.ts already clean; no
     optionalWith/transform markers exist in cluster files.
   - logger.ts per `6174ab46d`: `Logger.replace(Logger.defaultLogger, x)` →
     `Effect.provide(Logger.layer([x]))`; custom logger reads annotations from
     `fiber.getRef(References.CurrentLogAnnotations)` (v4 `Logger.Options`
     dropped `annotations`; now a plain record, not HashMap); LogLevel is a
     string union — `logLevel._tag` comparisons → string equality; `logSync`
     runSync shim verified live under bun (annotations flow, debug filtered at
     default Info minimum, no duplicate default-logger output).
   - Runtime probes (bun, repo deps): logSync/runWithLogger output correct;
     `withSpan` + `Effect.provide(OtelTracingLive)` inert; migrated error
     classes keep `_tag` = `name` = tag, instances yieldable, `.make` usable
     in flatMap position, catchTag/catchTags narrow — all v3-identical.
   - Gates: `vp check` on all 14 changed files — pass (format + lint, zero
     reds); `auth-payload.test.ts` 10/10; zero new casts/suppressions (diff
     grep clean); both cluster codemod markers removed (20 remain, all in
     other clusters' files).
   - **Boundary blockers (out-of-scope files poisoning cluster types):**
     ① `connect/errors.ts` — 6 error classes still v3 `Schema.TaggedError`;
     `SessionLookupError` poisons `org/service.ts:104/253` (4 of the 5
     residual cluster errors) and, via `billing/routes/shared.ts`, newly
     surfaces `checkout.ts:85`. ② `account-deletion/prepare.ts:11`
     (`MissingActiveOrgError`) + `account-deletion/runtime.ts:18`
     (`DeletionRuntimeError`) poison `auth/index.ts:247` (the 5th residual).
     Both are mechanical `TaggedErrorClass` renames of the pattern set here —
     land them with C6 (or as a 2-file pre-C6 unblock). RG note: `connect/
errors.ts:21,38` additionally need `Schema.Defect` → `Schema.Defect()`.
     **Resolved: landed as the C8a boundary pre-fix (step 5), C2 at true
     zero.**
     **RG-cluster verdict (2026-08-09, fable): ACCEPT, zero blockers.** Both
     focal semantic risks independently probe-verified: cache decision AGREED
     (rebuild-per-provide proven empirically in v3 AND v4; in-provide dedupe
     intact — diamond probe built shared layers exactly once); double-logging
     definitively ruled out (`Logger.layer` replaces unless
     `mergeWithExisting`; probe emitted exactly one line). TaggedErrorClass
     identifier-omission reasoning concretely confirmed (vendor-style
     identifier would leak into `error.name` → `safeErrorInfo` logs). Two
     drift notes added to Found issues; two counts corrected inline.

5. [x] **Commit 4 — C8a test harness: `@effect/vitest` (39 files).**
       Makes per-cluster tests runnable for everything after; from here each
       cluster's done-when includes its vitest subset green.
       **Done-when:** one foundation-adjacent test file green end-to-end.
       **Executed (2026-08-09):**
   - **Boundary pre-fix rode this unit (C2 → true zero):** `connect/errors.ts`
     (6 classes → `TaggedErrorClass`, `Defect()` ×2), `account-deletion/
prepare.ts`, `account-deletion/runtime.ts` (+ its `Defect()` at :31, same
     mechanical pattern). `check:effect` 272→260 on the pre-fix alone; zero
     diagnostics anchored in any C2 or boundary file afterward.
   - **Harness core:** `@effect/vitest@4.0.0-beta.99` source read end-to-end —
     `it.effect`/`it.live`/`it.layer`/`layer`/`flakyTest` all survive with
     unchanged call shapes; `it.effect` now includes `Scope.Scope` (v3
     `it.scoped`/`it.scopedLive` folded in — repo used neither); test env =
     `TestConsole.layer + TestClock.layer()` from `effect/testing/*`. All 39
     import sites already v4-valid. `src/livestore/__tests__/test-helpers.ts`
     (the import-crash): `Logger.withMinimumLogLevel(LogLevel.None)` →
     `Effect.provideService(References.MinimumLogLevel, "None")` (pipe shape
     preserved); `createStorePromise` `logLevel` is a v4 string union →
     `"None"`. `e2e/setup.ts` + `helpers.ts` + `stubs/*` are effect-free;
     `_helpers/x-sync.ts` v4-valid as-is.
   - **Test-file API sweep (25 files):** `Effect.either`→`Effect.result`
     (~55 sites incl. point-free), `Either.isLeft/isRight`→
     `Result.isFailure/isSuccess`, `.left/.right`→`.failure/.success` (99
     accessor sites, all verified Either-typed before the rewrite),
     `Logger.withMinimumLogLevel(LogLevel.X)`→`provideService(References.
MinimumLogLevel, "X")` (11 files, levels preserved), `Effect.
makeSemaphore`→`Semaphore.make` ×8 + `unsafeMakeSemaphore`→
     `Semaphore.makeUnsafe` ×2, `Effect.yieldNow()`→`Effect.yieldNow` ×1.
     Exhaustive token audit: all 58 distinct `Module.member` tokens used
     across test files exist in beta.99. Zero assertion values, mock
     semantics, or test structure touched.
   - `check:effect`: 272→**144 errors**, 111→**30 warnings**. `vp check`
     (lint+format) green on all 29 changed files.
   - **Unit suite: boots for the first time.** Baseline (8ea6c20, measured
     via stash): 34/92 files, 502 passed / 23 failed tests, 45+ suites
     import-dead. After: 34/92 files (every harness-fixed file still
     prod-blocked), **566 passed / 86 failed of 652** (+64 newly passing).
     Foundation-adjacent green e2e: `auth-payload.test.ts` 10/10 plus 33
     more files.
   - **Triage of all 58 non-green files — (c) BEHAVIOR is EMPTY:** zero
     assertion failures anywhere; all 86 failing tests are API-level.
     (a) FIXED within still-blocked files: do-programs 0→56 passing,
     link-event-store.live 0→1, link-repository.live 0→2, stripe-sync 0→5.
     (b) BLOCKED at import, 45 files: 39 on v3 `Schema.TaggedError` in 19
     prod files (C4 link-processor/metadata; C5 sync/errors; C6 connect/
     services, invites, ingest, admin ×3, billing/routes/shared, account-
     deletion/workflow, chat-agent/auth; C7 telegram ×2, x-sync, x-enrichment
     ×2, weekly-digest, queue-handler) + 6 on v3 `Schema.transform` in
     `livestore/queries/schemas.ts` (C3). BLOCKED at runtime: 68 tests in 11
     store-backed files (materializers ×6, flows ×2, do-programs,
     link-event-store, link-repository) — C3 Date-wire kills the store (see
     Found issues); 18 tests on removed `Option.fromNullable`/
     `flatMapNullable` in `billing/stripe-sync.ts` (C6) +
     `weekly-digest/build-digest-links.ts` (C7).
     (d) HARNESS: none observed — `@effect/vitest` beta.99 runs clean under
     vitest 4.1.7. `process-link-concurrency.test.ts` (hotspot 8) is still
     import-blocked (C7 `x-enrichment/errors.ts`) — its interleaving
     assertions have NOT run yet; re-triage when C4/C7 land.
   - **e2e deferred to G2:** the worker entry imports `queue-handler.ts`
     (v3 `Schema.TaggedError`) — every e2e suite dies at worker boot for
     prod reasons; the admin.test.ts pool-workers × @effect/vitest
     intersection (hotspot 9) is unassessable until C4–C7 land.

6. [x] **Commits 5–7 — livestore-boundary clusters (highest risk).**
       (5) C3 schema/events — the Date-wire sweep + golden round-trip test IN THE
       SAME COMMIT (matrix rows 1–2). (6) C5 sync glue — leave the
       `liveLongTimers` probe in place; extend it to wrap `setTimeout` (matrix
       row 4). (7) C4 LinkProcessorDO pipeline.
       **Done-when per cluster:** diagnostic-clean + cluster tests green + count down.
       **Review gate — RG-cluster per cluster (alternate opus/fable):** schema
       reviewer gets `ddd1aa16c` as required reading; sync/LP reviewers get
       `88a4b993e` + `3b0326a93` and check Mailbox→Queue backpressure +
       hibernation-adjacent scope handling.
       **Executed C3 (2026-08-09):**
   - **Wire truth captured FIRST, two sources:** (a) real rows — local
     SyncBackendDO sqlite copied to the scratchpad, `eventlog_7_*` dumped:
     11 of 26 event types present (1 earliest row each exported); all Date
     args are `toISOString()` strings. (b) synthetic goldens — a temp bun
     script in `apps/extension` (deleted after) encoded ONE instance of all
     26 event types (+3 null-variants) with **effect@3.21.2** (the
     extension's lagging v3 copy) against `main:src/livestore/schema.ts`
     with the `@livestore/livestore` wrapper stubbed (import-line-only edit;
     wrapper doesn't touch args encoding — `materializer-helper` calls plain
     `Schema.encodeSync(eventDef.schema)`). Full v3-livestore-snapshot import
     was attempted first and is broken in the mixed tree (see Found issues).
     Both sources live in `src/livestore/__tests__/fixtures/event-wire-goldens.json`
     (`$provenance` key describes generation inline).
   - **Recount resolved:** the "30 `Schema.Date`" inventory hits = **18 wire
     `Schema.Date` event fields + 12 `Schema.DateFromNumber` columns**.
   - **Wire sweep:** 18 event fields → hoisted
     `const EventDate = Schema.DateFromString.check(Schema.isDateValid())`
     (upstream `ddd1aa16c` idiom, shared-const form). Probe-verified
     byte-identical to v3 `Schema.Date`: encode = `toISOString()` string,
     struct key order = schema field order, decode = `new Date(s)` +
     validity check (v4 `DateString` is plain `Schema.String` + annotation —
     no format narrowing), invalid dates rejected both directions.
   - **DateFromNumber audit: API did NOT survive** — `Schema.DateFromNumber`
     is absent from beta.99 (and livestore's re-export), so all 12 columns
     silently became `undefined` → `defaultSchemaForColumnType('integer')` =
     `Schema.Finite`. THAT was the "Expected number, got <ISO>" killer: the
     error is the STATE-COLUMN encode path (`sql-queries.ts:285`
     `Schema.encodeResult(columnDef.schema)(date)`), a Date arg hitting the
     Finite fallback, with v4's issue formatter rendering the Date via
     `toISOString()` — reproduced byte-exactly. Not event args, not
     client-document (repo has none). Fix: all 12 → `Schema.DateFromMillis`
     (probe-verified: encode `getTime()`, decode `new Date(ms)` — identical
     to v3 DateFromNumber).
   - **Golden test:** `src/livestore/__tests__/event-wire-format.test.ts`,
     71/71 green — per synthetic golden: v4 decode == canonical instance
     (field-level, Date instances) AND v4 encode == v3 string byte-identical;
     per real row: decode + re-encode byte-identical to the production args
     TEXT; plus a field-by-field decode of the first prod `v2.LinkCreated`.
   - **Mechanical rest:** `Schema.transform` ×2 →
     `from.pipe(Schema.decodeTo(to, SchemaTransformation.transform({decode,
encode})))` (queries/schemas.ts `linkByIdSchema`, queries/links.ts
     `archiveCountSchema` — the latter also absorbs the removed
     `Schema.headOrElse` as `rows[0]?.count ?? 0`; semantics probe-verified).
     top-bar.tsx `Schema.URL` → `Schema.URLFromString` (v4 `Schema.URL` =
     `instanceOf(URL)`; see Found issues). ZERO edits needed (probe/source
     verified survivors): `Schema.decodeUnknownOption`, all `Match.*`
     patterns in tool.tsx/overview-retention/error-message/
     use-roving-tag-focus/extension.tsx (value/when-literal/when-predicate/
     when-object/whenOr/orElse/exhaustive), store.ts (`Effect.scoped`,
     `Stream.tap/runDrain`, `networkStatus.changes`, `shutdownPromise`),
     livestore.worker.ts (`makeWsSync` ping shape, `initialSyncOptions`
     `_tag: "Blocking"`), livestore-shared-worker.ts (`makeWorker`), and
     queries/{filtered-links,tags,weekly-digest}.ts (plain Struct/Array/
     NullOr). No `Option.fromNullable` in cluster files. Both C3 codemod
     TODO markers removed (20 → 18 repo-wide).
   - **Scoreboard:** unit 566/652 → **849/867** (40 suites still
     import-blocked on C4–C7 debt); store-shutdown grep = 0; livestore dir
     15 files / 204 tests all green; do-programs + link-event-store +
     link-repository 86/86. check:effect 144/30 flat, zero C3-anchored.
     `vp check` pass on all touched files; diff cast/suppression audit clean.
   - **CI gating:** verified `bun --cwd apps/extension run compile` fails
     (exit 2, cross-snapshot `LiveStoreSchemaSymbol` identity — the v3-typed
     extension cannot consume the v4-typed schema); commented out the two
     extension steps (postinstall + compile) in `ci.yml` with the TEMP note.
     `test:ext` (line ~89) left untouched but is ALSO red — pre-existing at
     `3242c4e`, see Found issues.
     **Executed C5+C4 (2026-08-09, combined unit):**
   - **Scope:** `sync/{errors,index,validate-payload,record-activity,
auth-payload,activity}.ts` + `link-processor/**` + `metadata/**` +
     colocated tests. 11 files changed (+133/−127); tests needed ZERO edits
     (C8a had already migrated their API forms).
   - **Adapter-API drift (fork `36dd15dac` → upstream `2e4bcfc68`), the
     unit's headline:** upstream #1541–#1545 reshaped the do-rpc client
     callback. ① `handleSyncUpdateRpc(payload)` →
     `handleSyncUpdateRpc(ctx, payload)` — pull-routing moved from a module
     global to a per-`DurableObjectState` WeakMap so a reconstructed DO
     starts empty. ② `ClientDoWithRpcCallback.syncUpdateRpc` gained a
     second parameter: `(payload: Uint8Array<ArrayBuffer>, storeId: string)`
     — the sync backend now passes the storeId so a store-less (rebuilt/
     hibernation-woken) client DO can reload its store BEFORE delivery.
     Migrated `LinkProcessorDO.syncUpdateRpc` to the upstream-documented
     minimal pattern (vendor example `cloudflare-todomvc/src/
live-store-client-do.ts`): set `this.storeId` from the RPC arg, always
     `ensureSubscribed()`, then `handleSyncUpdateRpc(this.ctx, payload)`.
     **New-behavior wiring, not a rename:** the old code read the persisted
     `storeId` from DO storage and SKIPPED store wake when absent; the
     RPC-provided storeId is always present, so a store-less wake now always
     recovers (that recovery is exactly upstream #1545's intent). ③
     Everything else verified UNCHANGED at 2e4bcfc68: `createStoreDoPromise`
     options shape, `makeDurableObject`/`onPush(message, context)` incl.
     `batch[].name`/`parentSeqNum`, `handleSyncRequest`/`matchSyncRequest`
     call shapes, `eventlog_<PERSISTENCE_FORMAT_VERSION>_*` table
     naming (getEventlogMax's `eventlog_*` GLOB still matches).
   - **C5 probe (matrix row 4):** `sync/index.ts` monkey-patch extended to
     wrap `setTimeout`/`clearTimeout` alongside `setInterval`/
     `clearInterval` — shared `longTimerIds` set, same 1_000_000 ms
     threshold, same `liveLongTimers` push-log reporting; a long setTimeout
     additionally untracks itself when it fires (one-shot timers stop being
     pending). Stale patch reference in the comment updated (sanctioned).
     NOTE: the extension mirrors the probe's pre-existing `as` casts for the
     two new global assignments (overloaded globals can't be satisfied
     structurally) — declared in the unit report.
   - **Error classes:** `Schema.TaggedError` → C2's
     `Schema.TaggedErrorClass<Self>()("Tag", fields)` in sync/errors (6),
     link-processor/errors (3), metadata/errors (3); `Schema.Defect` →
     `Schema.Defect()` ×2. `override get message()` getters probe-verified
     to survive on TaggedErrorClass. All 6 `schema-optionalWith-manual`
     markers resolved via the new `withConstructorDefault` pattern (see
     Decisions log); `.make` applies constructor defaults (probe-verified).
   - **Mechanical rest:** `Effect.unsafeMakeSemaphore` →
     `Semaphore.makeUnsafe` ×3 + type `Effect.Semaphore` →
     `Semaphore.Semaphore` ×2 (permits identical: 8 metadata / 3 AI /
     MAX_SAFE_INTEGER unbounded); `Effect.gen(this, fn)` →
     `Effect.gen({ self: this }, fn)` ×5 (durable-object ×4, sync/index ×1
     — beta.99's second gen overload takes `{ self }`; this killed the
     `any`-context poison at durable-object.ts:103/123 and typed `this`
     for real); `Option.fromNullable` → `Option.fromNullishOr` ×3
     (durable-object, generate-summary, metadata/schema);
     `Schedule.compose(Schedule.recurs(2))` → `Schedule.upTo({ times: 2 })`
     ×2 (probe: 3 attempts, exponential delays preserved — v3-identical);
     `Effect.zipRight` → `Effect.andThen` ×2 (probe: lazy re-evaluation
     preserved); `Logger.replace(Logger.defaultLogger, x)` →
     `Logger.layer([x])` in link-processor/logger.ts (C2 pattern);
     `Schema.transform` → `decodeTo` + `SchemaTransformation.transform`
     (metadata/schema.ts `ResolvedUrl`, C3 pattern; decode behavior
     probe-verified incl. protocol-relative + junk URLs). All 7 remaining
     C4/metadata codemod markers removed (18 → 11 repo-wide).
   - **Behavior preserved verbatim:** per-link `liveLayer` rebuild
     untouched; all `catchDefect` store-null self-heal paths byte-identical;
     layer composition unchanged; `storeId!` at (now) durable-object.ts:461
     kept — the oxlint `no-unnecessary-type-assertion` transient RESOLVED
     (vp check green) because `this` is now really typed inside gen.
   - **Scoreboard:** check:effect 144/30 → **121/19**; in-scope anchored
     35 → 1 (the C7-rooted residual above). Unit 849/867 → **891/909**;
     newly green: content-extractor.test + generate-summary.test (+42
     tests); in-scope suites green: do-programs 56, link-event-store,
     link-repository, metadata-jsonld, extractors ×4, decode-entities,
     fuzzy-match, format-payload, auth-payload 10/10. `vp check` pass on all
     11 touched files; zero new suppressions/.skip; casts limited to the two
     declared probe-pattern mirrors.
   - **Still blocked (boundary, NOT this unit's debt):** ①
     `process-link.test.ts` + `process-link-concurrency.test.ts` (hotspot 8) import-crash on C7 `x-enrichment/errors.ts` (v3 `Schema.TaggedError`
     TypeError) via `process-link.ts` → `enricher.ts`; full unblock also
     needs C7 `x-enrichment/generator.ts` (v3 `Effect.Service` — same
     module-eval crash class). **Hotspot 8's interleaving assertions have
     STILL NEVER RUN under v4** — first C7 action item. ②
     `sync/__tests__/validate-payload.test.ts` (C5's own suite)
     import-crashes on C7 `telegram/services.ts` via `auth/service` →
     `account-deletion/runtime` → `telegram-key-store.live`; its 16
     check:effect diagnostics DID clear with sync/errors.ts, only the
     runtime import remains blocked. ③ e2e (incl. the LP↔SB round-trip
     smoke this pair was combined for) stays blocked at worker boot on C7
     `queue-handler.ts` — G2 item, unchanged.

7. [x] **Commits 8–N — C6 + C7 feature clusters, then frontend, then C9
       extension.** One commit per cluster; burn down warning-class backlog items
       as their cluster lands. Extension last (after C3 stable), gated by
       `bun run test:ext` + loading the unpacked extension.
       **Review gate — RG-cluster**, batching small clusters 2–3 per review.
       **Executed C7 (2026-08-09):**
   - **Hotspot 8 verdict FIRST: PASS.** `process-link-concurrency.test.ts`
     ran under the v4 fiber runtime for the first time and passed **4/4** —
     zero interleaving/assertion drift. Unblock order per plan:
     x-enrichment/errors.ts + usage.ts (TaggedErrorClass, Defect(),
     fromNullishOr, the optionalWith marker) → generator.ts + the
     import-chained weekly-digest/generator.ts (both v3 `Effect.Service` →
     C2 `Context.Service` pattern; no accessor call sites existed) +
     weekly-digest/errors.ts (chain) → test stubs `new X(shape)` →
     `X.of(shape)` → run. `process-link.test.ts` + all 5 x-enrichment
     suites green in the same step (71/71).
   - **Scope:** 21 files (+205/−242): telegram/{errors,services,
     services/telegram-key-store.live}, x-sync/{errors,durable-object},
     x-enrichment/{errors,usage,generator,services/thread-provider-noop.
     live}, weekly-digest/{errors,generator,rpc,build-digest-links},
     chat-agent/{auth,index}, queue-handler.ts + 5 test files (API forms
     only). Tests needed exactly two form classes: `new ServiceClass(shape)`
     → `ServiceClass.of(shape)` (8 sites, 5 files — RG-corrected; the Decisions entry enumerates them) and zero others (C8a had
     the rest).
   - **Error classes:** 32 v3 `Schema.TaggedError` → `TaggedErrorClass`
     across 8 files (telegram/errors 6, telegram/services 1, x-sync 7,
     x-enrichment/errors 8, x-enrichment/usage 2, weekly-digest 3,
     chat-agent/auth 3, queue-handler 2); `Schema.Defect` →
     `Defect()` ×10; all 8 remaining `schema-optionalWith-manual` markers
     resolved via the established `withConstructorDefault` pattern
     (telegram ×5, queue-handler ×2, x-enrichment ×1). Repo-wide codemod
     TODO markers now **1** (RG-corrected: `admin/activity-stats/repo.ts:10`, a C6 file — the residual-sweep step keys off this count).
   - **Mechanical:** `Effect.gen(this,…)` → `gen({self:this})` ×10 (x-sync
     DO ×6, chat-agent DO ×4); `Logger.replace(Logger.defaultLogger,
XSyncLogger)` → `Logger.layer([XSyncLogger])` (C2/C4 pattern; x-sync
     `baseLayer` per-call rebuild otherwise UNTOUCHED per the C2 parity
     decision); `Effect.zipRight` → `andThen` ×1 (telegram-key-store);
     `Effect.zipLeft(e)` → `Effect.tap(() => e)` ×2 in queue-handler — the
     retry()/ack() side-effect ordering + error propagation + return value
     all preserved (tap = run after success, discard result, propagate
     failure — v3 zipLeft-identical here); `Effect.timeoutFail({duration,
onTimeout})` → `Effect.timeoutOrElse({duration, orElse})` with the
     failing TaggedErrorClass instance as the orElse effect
     (thread-provider-noop — v3-identical: source interrupted, custom error
     failure); `Schema.Schema.Type<typeof X>` → `typeof X.Type` ×3
     (weekly-digest rpc ×2 + generator); `Option.fromNullable` →
     `fromNullishOr` ×3 (usage, build-digest-links, — plus none remained
     elsewhere in scope).
   - **v4 `Array.filterMap` contract change (the unit's headline find):**
     it now takes a `Result`-returning filter (`Result.isSuccess` gate) —
     an Option-returning callback compiles nowhere but at RUNTIME every
     element is silently discarded (Option.some is not Result.Success),
     exactly build-digest-links' 8 reds. Fix: terminal
     `Result.fromOption(() => null)` bridge on the Option pipeline.
     `HashMap.get` still returns Option (verified) — only the filterMap
     boundary needed conversion.
   - **Scoreboard:** check:effect 121/19 → **36/8**; C7-anchored
     diagnostics **0**; the C4 residual (link-processor/durable-object.ts: 396) **cleared** as predicted (EnrichmentGenerator/OpenRouterApiKey
     types now real). Unit 891/909 → **1173/1191**. Newly green incl.
     hotspot 8 (4/4), process-link, x-enrichment ×5, weekly-digest ×7
     (60/60), chat-agent ×2, telegram-handlers, x-api-client,
     x-initialize-watermark, x-poll-once, billing.test (14/14, incl. the 5
     chat-agent gate tests after its one v3 stub form → `.of`),
     `sync/__tests__/validate-payload.test.ts` (C5's suite, unblocked as
     predicted). `vp check` pass on all 21 files; diff audit: zero casts /
     suppressions / .skip.
   - **Triage of all 12 non-green files — (c) BEHAVIOR EMPTY, (d) HARNESS
     EMPTY, everything is (b) C6-boundary:** ① 9 suites import-dead on v3
     `Schema.TaggedError` in C6 files — `connect/services.ts` (kills
     connect ×3, raycast-connect, ingest-service, invites/
     create-invite-body, and C7's own colocated `telegram/__tests__/
resolve-public-url.test.ts` via telegram/connect-prompt → connect/
     telegram) and `account-deletion/workflow.ts:51` (kills its own
     suite). ② stripe-sync 9 reds: `Option.fromNullable`/`flatMapNullable`
     in billing/stripe-sync.ts (pre-categorized C6, unchanged). ③
     api-key-gate 6 + hooks 3 reds: v3 `new Billing({…})`/`new
AppSettings({…})` stubs in the TEST files — under v4 the constructed
     instance carries no shape, methods are undefined; includes ONE
     assertion-looking failure (`Effect.exit smoke` expecting success)
     that is downstream of the same broken stub, NOT a v4 behavior change
     (root-caused). Fix is the same `.of()` API form when C6/C8 touches
     those files.
     **Executed C6 (2026-08-09, FINAL cluster — zero clusters remain):**
   - **Priority 1 — the two silently-broken `Arr.filterMap` sites FIXED
     and verified:** ① `connect/telegram.ts:231` — the Option pipeline
     bridged with the established terminal `Result.fromOption(() => null)`;
     verified by `connect/__tests__/telegram.test.ts` "revokes only
     telegram-source keys" (asserts deleted == [tg-1, tg-2] against a mixed
     telegram/raycast/null/bad-json key set) — suite green post-unblock. ②
     `admin/activity-stats/metrics.ts:192` (`retentionGrid`) — native
     `Result.succeed`/`Result.fail(null)` callbacks (callback constructed
     the Option directly, no pipeline to bridge). NO test covers
     retentionGrid (only e2e admin.test, which doesn't hit activity stats);
     verified via a scratchpad runtime probe: 2 cohorts with correct
     per-age retained counts (0 cohorts when broken).
   - **Hotspot 6 — CF Workflows Runtime bridge migrated
     (`account-deletion/workflow.ts`):** `Effect.runtime<R>()` +
     `Runtime.runPromise(rt)(body)` → `Effect.context<R>()` +
     `Effect.runPromiseWith(services)(body)` — v4 has no v3 `Runtime`
     (beta.99 `Runtime` module = runMain plumbing only); the replacement is
     the vendor-canonical form (store.ts:1271, StoreRegistry.ts:300,
     ws-rpc-server.ts:189). Rejection semantics probe-verified (see
     Decisions). The rejection-semantics comment updated (sanctioned
     exception): `Effect.either` → `Effect.result`, plus the v4 rejection
     value shape. `workflows/account-deletion.ts` (entry) needed ZERO
     changes — already v4-valid (`Cause.pretty`, `tapCause`, decode).
   - **Error classes:** 20 v3 `Schema.TaggedError` → `TaggedErrorClass`
     across 8 files (ingest/errors 6, invites/errors 5, trigger-digest 4,
     connect/services 1, signup-gate 1, workspaces 1, billing/routes/shared
     1, account-deletion/workflow 1); `Schema.Defect` → `Defect()` ×4.
   - **The LAST codemod TODO marker cleared:**
     `admin/activity-stats/repo.ts` v3 `Effect.Service` → C2 pattern
     (hoisted `make` + `Context.Service<Self, Effect.Success<typeof make>>`
     - `Default` static); consumer `handler.ts` unchanged
       (`ActivityStatsRepo.Default` contract preserved). Repo-wide marker
       count now **0**.
   - **Removed-API debt:** stripe-sync.ts `Option.fromNullable` →
     `fromNullishOr` + `flatMapNullable` → `flatMapNullishOr` ×2 (beta.99
     kept `flatMapNullishOr` — no restructure needed; its 9 reds → green);
     trigger-digest `fromNullable` → `fromNullishOr`; invites/service.ts
     `Schema.Number.pipe(Schema.int(), positive(), lessThanOrEqualTo)` →
     `.check(Schema.isInt(), isGreaterThan(0), isLessThanOrEqualTo)` (a
     silent module-eval crash — see Found issues); workspaces.ts
     `Schema.Literal(...spread)` → `Schema.Literals(arr)` ×3;
     trigger-digest `catchTag("ParseError")` → `catchTag("SchemaError")`
     (v4 decode failure tag — the stale tag compiled as dead code, decode
     failures would have skipped the 502 mapping); `Effect.Effect.Success/
Error` → `Effect.Success/Error` (ingest + invites services);
     `Schema.Schema<A, I>` → `Schema.Codec<A, I>` (decodeBody ×2 in
     workspaces + billing/routes/shared — v4 `Schema` takes 1 type param).
   - **Test stubs:** v3 `new Billing({…})`/`new AppSettings({…})` →
     `.of()` in 5 files (api-key-gate, hooks, connect/telegram.test,
     connect/x.test, raycast-connect) — the api-key-gate `Effect.exit
smoke` pseudo-assertion failure resolved with the stub as predicted.
   - **Nothing-needed findings:** `connect/x.ts`, `connect/telegram.ts`
     (beyond filterMap), `index.ts` worker entry, ingest/service +
     invites/service handler bodies, billing routes — all already v4-clean
     from the codemod (`Schema.parseJson` ×2 the plan expected were
     already `fromJsonString`; the catchTag-dense files had zero
     residuals). Per-request `Layer.provideMerge(AppLayerLive(env))` sites
     untouched (C2 parity decision).
   - **Scoreboard:** check:effect 36/8 → **0/0 — repo-wide ZERO**. Unit
     1173/1191 → **1290/1292** (total grew: import-dead suites now
     register; the 2 reds are category (c), see Found issues). E2e first
     v4 run: **6/6 files green, 52 passed / 3 skipped** (pre-existing
     `describe.skip` durability suites); **the
     server-ingest-stranding incarnation probe PASSED** ("in-memory state
     is destroyed and recreated"); miniflare workflows-binding
     "Engine was never started"/"instance.not_found" stderr noise in
     delete-account polling is harness noise, all assertions green.
     Typecheck (bonus, report-only): **FAIL, 73 errors** — ~60 in test
     files (raycast-connect 18, extension.test 9, billing.test 9,
     auth-client.test 8, invite-store.test 7, links/handler.test 4,
     ingest-service.test 4, scheduler.test 2, + singles), vite.config.ts
     5, and 3 out-of-cluster prod singles (C3 livestore/queries/schemas.ts
     transform typing, C4 link-processor/durable-object.ts:740
     workers-types `DurableObjectState` generic, C7 chat-agent/index.ts:168
     arity) — the residual sweep (step 8) owns these. `vp check` pass on
     all 19 changed src files (14 prod + 5 test); zero new
     casts/suppressions/.skip (the workflow-bridge `as never` is the
     pre-existing documented cast, retained; diff-grep audit clean).

8. [x] **Commit N+1 — residual sweep to full green.**
       Clear remaining diagnostics + leftover TODOs; then the branch's first full
       `bun run typecheck` and `bun run test:unit`.
       **Review gate — RG-boundary (one fresh fable subagent):** whole-boundary
       review of `src/livestore/` + `src/cf-worker/sync/` + LP↔livestore glue
       against the upstream playbook — hunting v3 semantics that survived
       compilation.
       **Executed (2026-08-10, combined with step 9 in one unit):**
   - **The sanctioned category-(c) fix (the migration's ONLY assertion
     change, user-approved):** `workflow.test.ts`'s two
     `String(error.cause)).toContain("<op> boom")` assertions → the
     reviewer-prescribed stronger form:
     `expect(error.cause).toBeInstanceOf(DeletionRuntimeError)` +
     instanceof-guarded `expect(String(error.cause.cause)).toContain(…)`.
     Suite 5/5; nothing else in the file changed.
   - **tsgo characterization first:** 4 sequential runs on the untouched
     tree were byte-identical — 73 errors each (diffed pairwise; the
     historical 7/94/73/0 spread did NOT reproduce sequentially; the cliff
     constructs below explain the order/state sensitivity). Union = the 73.
     Three `TS2321 Excessive stack depth` seeds sat in vite.config.ts.
   - **Test-file class (~60 errors):** v4 `Context.Service` class instances
     carry the shape under `readonly Service`, NOT v3's `Type` —
     `X["Type"]` → `X["Service"]` (24 sites / 11 test files);
     `ConstructorParameters<typeof Billing>[0]` → `Billing["Service"]`
     (the v4 ctor is `new (_: never)`, so ConstructorParameters = never);
     `Billing["capabilities"]` → `Billing["Service"]["capabilities"]`;
     pre-existing `as unknown as Billing` casts retargeted to
     `Billing["Service"]` (no new casts). Every TS7006 implicit-any was
     downstream contextual-type fallout of these.
   - **Prod singles:** ① chat-agent/index.ts:168 was a REAL latent runtime
     bug (see Found issues) — `syncUpdateRpc` migrated to the upstream
     2-arg callback + `handleSyncUpdateRpc(this.ctx, payload)` (ChatAgentDO
     derives storeId from `this.name` — RG-CORRECTED: `this.name` THROWS on a cold idFromString RPC wake (PartyServer hydrates it only on fetch/alarm/WS entry), so LP-style wiring IS needed; applied post-review — `getStore(storeId?)` takes the RPC arg, plus a `storeCreationPromise` single-flight guard the DO was missing, closing its PR-#30 concurrent-boot exposure).
     ② queries/schemas.ts `linkByIdSchema`: explicit
     `transform<LinkWithDetails | null, ReadonlyArray<LinkWithDetails>>`
     type args (inference unified the sides wrongly). ③
     durable-object.ts:740 + the vite.config errors: dual-type-identity
     fixes per the Decisions entry (bridge d.ts + paths pin,
     workers-types override, vite 8.0.14, real-vite UserConfig).
   - **scripts/ v3 leftovers** (outside the tsgo project; pre-existing
     `vp check` lint reds surfaced them progressively): mock-ingest
     `Effect.either`/`Either.*` → `result`/`Result.*`,
     `Schema.TaggedError` → `TaggedErrorClass` ×2 (module-eval crash
     class), `Stream.asyncPush` → `Stream.callback` + `Queue.offerUnsafe`;
     check-pricing `Either` → `Result`. Runtime-smoked (TaggedErrorClass
     instance constructs, `_tag` correct).
   - **Battery receipts:** `bun run typecheck` **3 consecutive runs, 0
     errors each** (10+ zero-runs total during stabilization; one
     transient documented in Found issues). `bun run check` full chain
     green (format 1147 files, lint 0/0 in 621 files, check:effect **0/0**
     in 574 files). `bun run test:unit` **1292/1292** (93 files — first
     fully green unit run of the branch). `bun run test:e2e` **6/6 files,
     52 passed / 3 skipped** (pre-existing describe.skip durability
     suites; known miniflare workflows stderr noise only).

9. [x] **Commit N+2 — marker + docs.** Implement the `__LIVESTORE_BUILD__`
       define + post-build assert; update
       [[architecture/livestore-fork-integration]] (status → "vendored upstream")
       and the strategy doc.
       **Done-when:** marker documented; docs no longer claim fork-isms.
       **Executed (2026-08-10, same unit):**
   - Marker + verify-bundle design and rationale: see the 2026-08-10
     Decisions entries. Receipts: `bun run build` → all 5 asserts pass,
     `quoted "vendored@2e4bcfc68" x1`, prerender OK after.
     `LIVESTORE_PUBLISHED=1 vp build` + `LIVESTORE_PUBLISHED=1 bun
scripts/verify-bundle.ts` (the closest published invocation — `bun run
build` also works with the env since every chained script inherits it)
     → marker flips to `quoted "published" x1`, `vendored@` x0, all asserts
     pass — validating the marker itself in both directions.
   - [[architecture/livestore-fork-integration]] truth-up (surgical):
     status paragraph → vendored UPSTREAM `livestorejs/livestore` `main` @
     pinned SHA, no fork branch, no carried patches; Goal section marked
     historical; submodule bullet + `.gitmodules` URL fact; published-pin
     bullet → 2e4bcfc68 snapshot + re-pin-on-bump rule; patches bullet →
     patchedDependencies EMPTY (the `@effect/rpc` "keep it" claim was
     stale-dangerous); the `MAX(generation)` grep instruction → the
     `__LIVESTORE_BUILD__` marker + verify-bundle; pnpm 11.3.0 → 11.8.0 ×2;
     effect 3.21.2 → 4.0.0-beta.99 ×2; References split current/historical.
     The strategy doc's own marker mention (line ~162) already described
     this plan — left as-is (it's the plan doc, not the status doc).

10. [ ] **Validation battery (fix-ups as small commits).**
        `bun run clean:local-state` (registry moved SQL→DO KV; user restarts the
        dev server). Then: `test:unit`, `test:e2e` (stranding incarnation probe
        passes), upstream hibernation suites inside the submodule
        (`tests/sync-provider/src/do-hibernation.test.ts` +
        `do-rpc-hibernation.test.ts`), ~~`LIVESTORE_PUBLISHED=1` typecheck/
        build/test pass~~ (DROPPED, user decision 2026-08-10 — same-SHA lanes
        make it a packaging tautology; the step-9 receipts already validated
        the marker in both directions), real `bun run build` with marker = 1,
        bundle asserts (matrix rows 5–6), extension compat smoke (matrix
        row 8). Preview deploy
        ONLY via pushing the branch (Workers Builds `versions upload`) — never
        local remote wrangler.
        **Done-when:** every line has a recorded receipt (command + result) below.
        **Executed (2026-08-10): DONE — all receipts recorded in the
        _Step 10 receipts (2026-08-10)_ section right below this list**
        (kept out of this list item: the markdown formatter cannot
        round-trip nested bullets under a two-digit ordered item).

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
        **Executed (2026-08-10) — dual review on `ed89bfd`, 155 files:**
    - **Reviewer A (fable, correctness): MERGE-READY.** Zero unrecorded
      behavior deltas; probe-confirmed: `Schedule.upTo` retry counts
      (no off-by-one), filterMap polarity ×3, wire goldens 71/71,
      `runPromiseWith` rejects on failure/defect/interruption, chat-agent
      `storePromise` races safe, catchTag inventory (~90 sites) — only
      `TimeoutError`/`SchemaError` built-ins in play, both tag-verified
      against v4 source. Two informational notes (purgeAll-during-boot is
      strictly better than main; the setTimeout probe wrappers are
      behavior-preserving TEMP).
    - **Reviewer B (opus, completeness):** core clean (22 greps
      zero-or-false-positive, zero added suppressions, pins/gitlink
      coherent, blast radius fully mapped, independent battery green) but
      NOT merge-ready until F1–F11 dispositioned. Dispositions (fix batch
      applied 2026-08-10, this working tree): **F1** extension
      branch-broken via `@web` alias → recorded honestly (C9 note
      corrected) + **F2** fail-fast guard added to
      `publish-extension.yml` — both SUPERSEDED same day by the extension
      addendum (E1 `583ddaf` migrates the extension in-branch, E2 removes
      the guard + restores the CI steps; F1/F2 CLOSED); **F3** scripts
      stragglers FIXED
      (`tapDefect` now `Cause.pretty(Cause.die(defect))` in
      check-pricing + mock-ingest/index; `Result` annotation in
      mock-ingest/client — `scripts/` stays typecheck-excluded,
      pre-existing); **F4/F5/F6** tracker reconciled (commit list, stage
      table, handoff vs G3 waiver); **F7** fork-doc live instructions
      rewritten to the upstream-bump workflow, obsolete open items
      struck; **F8** `CLAUDE.md` (vendored upstream + submodule-bump flow
      - effect-solutions v4 caveat) and `EFFECT.md` (TaggedErrorClass,
        `Schema.Defect()`) updated; **F9** ACCEPTED — verify-bundle runs on
        every Workers Builds push (incl. PRs), GH-Actions omission is
        redundant coverage, not a gap; **F10** ACCEPTED carry (documented
        in-file + Decisions); **F11** fork→upstream comment sweep done
        (ci.yml, vite.config.ts, tools/livestore-local.ts).
        **Fix batch user-approved and committed 2026-08-10.**
        **Remaining for this step:** merge PR #82 (no rebase needed —
        main unmoved at `8e36bf3`; re-check at merge time).

### Step 10 receipts (2026-08-10)

Stage-4 battery on HEAD `265fd3e`; the only tree changes are the new row-7
probe file and this tracker.

- `bun run clean:local-state` + dev-server restart: left to the user
  (agent-forbidden); everything below ran without it.
- `bun run check`: PASS — format 1148 files, lint 0 errors / 0 warnings in
  622 files, check:effect 0/0/0 in 574 files.
- `bun run typecheck`: PASS — exit 0, zero errors; re-run after adding the
  row-7 probe file: still zero.
- `bun run test:unit`: PASS — 93 files, **1292/1292**.
- `bun run test:e2e`: PASS — 6/6 files, **52 passed / 3 skipped**
  (pre-existing describe.skip durability suites; known miniflare workflows
  stderr noise unchanged, all assertions green). With the new row-7 file
  (post-RG slim): **7/7 files, 53 passed / 3 skipped**.
- **Upstream hibernation suites (matrix row 4): PASS.** In
  `vendor/livestore/tests/sync-provider`:
  `pnpm exec vitest run src/do-hibernation.test.ts src/do-rpc-hibernation.test.ts`
  → 2 files / 2 tests passed (~46s test time). The node ≥24 caveat did NOT
  bite: `@local/tests-sync-provider` has no `engines` gate and vitest 4.1.9
  runs fine on local node v22.23.1 (the install-time warnings were
  example-package-only). Submodule tree verified clean after the run.
- **Matrix row 7 e2e (layer memoization): DONE (partial — scoped
  honestly per RG review).** New
  `src/cf-worker/__tests__/e2e/layer-memoization.test.ts`, slimmed after
  the RG pass to its ONE genuine detector: a `runHandler` probe capturing
  the `Billing` service instance on two sequential runs asserts two
  DISTINCT instances — `runHandler` provides the SAME memoized
  `getAppLayer(env)` object both times, so distinct services prove v4
  still rebuilds services per top-level provide (fresh MemoMap), pinning
  row 7's silent-failure mode: frozen per-isolate singletons would
  compare identical. What is NOT asserted, and why: layer-OBJECT reuse
  across requests holds by construction (the `runtime.ts:16` WeakMap —
  the RG review showed identity assertions through a test-supplied `env`
  are tautologies, so the executor's original 4 such tests were dropped);
  prod per-request `env` identity in workerd is not established by any
  local test (benign failure direction: extra rebuilds, never stale
  singletons); `getBillingLayer`
  (`billing/routes/runtime.ts:19`, row 7's second WeakMap) is not
  exported and stays review-verified; ~20 call sites invoke
  `AppLayerLive(env)` directly bypassing `getAppLayer` (queue-handler,
  ingest, sync, connect/\*, x-sync, account-deletion workflow, auth) —
  row 7's "audit module-scope layers closing over env" leg is
  review-only, source-audited during C2, not probed.
- `bun run build` (matrix rows 5, 6, 10): PASS — verify-bundle output
  verbatim:
  `ok  livestore build marker (quoted "vendored@2e4bcfc68" x1, expected x1)`,
  `ok  no effect v3 in worker bundle ("3.21.2" x0, expected x0)`,
  `ok  msgpackr CF-Workers fallback present ("inlineObjectReadThreshold" x3, expected >=1)`,
  `ok  no msgpackr-extract native binding ("msgpackr-extract" x0, expected x0)`,
  `ok  react singleton in client bundle (react-major version strings: [19.2.6], expected exactly [19.2.6])`,
  `verify-bundle: all assertions passed`; prerender completed (/, /privacy,
  /terms, /contact + SPA shell).
- **Extension compat smoke (matrix row 8) — locally automatable share
  DONE:** ① server-side suites covering the published extension's exact
  HTTP surface — `connect/__tests__/extension.test.ts` (connect + account +
  disconnect handlers), `sync/__tests__/validate-payload.test.ts` (the WS
  `syncPayload {apiKey}` lane), `auth-payload.test.ts`,
  `event-wire-format.test.ts` (the v3-encoded goldens generated with the
  extension's own effect 3.21.2) → 4 files / **115 tests green**; ②
  response-shape contract re-read on both sides —
  `{ user: { name, image } }` plus 401 semantics match the extension's
  `AccountBody` decoder and logout-on-401; ③
  `liveStoreStorageFormatVersion = 6` at BOTH the extension's pinned
  snapshot `6e9abadf4` (dist) and vendor `2e4bcfc68` (src); ④ static
  WS-protocol diff (submodule
  `git diff 6e9abadf4 2e4bcfc68 -- packages/@livestore/sync-cf/src/common/`),
  full enumeration per RG re-read: `.annotations()` → `.annotate()`,
  `Schema.Union(…)` → `Union([…])`, `Schema.JsonValue` → `Schema.Json`
  (×6, every rpc `payload` field), `Schema.Literal('http','ws')` →
  `Schema.Literals([…])`, export rename `splitChunkBySize` →
  `splitArrayBySize`, and ONE structural loosening:
  `SearchParamsSchema.payload` went `UndefinedOr` (required but
  undefinable) → `Schema.optional` — that field is the connect-URL query
  string the v3 extension encodes, the decode pipeline is equivalent
  (uri-component → JSON) and optionality only loosens the server side, so
  compat holds. Every wire tag string, field name, and union membership
  is otherwise identical.
  NOT provable locally (G3 preview smoke): the effect-rpc WS envelope
  between the published v3 client and the v4 server at runtime, graceful
  local-OPFS queuing on mismatch, v4-extension OPFS drain, chat-agent
  live-pull.
- `LIVESTORE_PUBLISHED=1` A/B pass: DROPPED (user decision 2026-08-10,
  recorded above) — not run, per that decision.
- G2's constituents (unit, e2e incl. the eviction probe + wire-format
  tests, upstream hibernation suites) are now all receipted — the gate
  flip is left to the user/orchestrator.

## Cluster checklist

Inventory taken 2026-08-09 against working tree (`main`, 8e36bf3). **Effect surface = 205 files**: 182 under `src/` (132 prod + 50 test), 19 under `apps/extension/`, 4 under `scripts/`. `@livestore/*` boundary: 28 files in `src/`, 6 in `apps/extension/`.

**Repo-wide grep counts (non-zero only).** Everything the rename map lists that scored **0** in this repo: `Effect.async`, `Layer.scoped`/`scopedDiscard`, `Mailbox`, `Stream.fromChunk`/`mapChunks`, `Chunk.`, `FiberRef`, `Context.GenericTag`, `ParseResult`, `DateTimeUtc`, `Effect.forkScoped`/`forkDaemon`, `Scope.` (src), direct `@effect/platform` / `@effect/rpc` imports. That kills a large slice of the official rename map before we start.

| pattern                                            | hits / files           | where                                                               |
| -------------------------------------------------- | ---------------------- | ------------------------------------------------------------------- |
| `Schema.` (all)                                    | 604 / 55               | `db/branded.ts`, `*/errors.ts`, `livestore/schema.ts`               |
| `Layer.` (all)                                     | 350 / 70               | `auth/service.ts`, `link-processor/durable-object.ts`               |
| `Effect.provide`                                   | 295 / 65               | `runtime.ts`, `billing/routes/runtime.ts`, DO files                 |
| `it.effect`                                        | 361 / 33               | `src/cf-worker/**/__tests__`                                        |
| `Effect.annotateLogs`                              | 218 / 54               | everywhere                                                          |
| `Layer.succeed` / `Layer.mergeAll`                 | 157 / 51, 125 / 29     | test layers + DO layers                                             |
| `Effect.annotateCurrentSpan`                       | 131 / 37               | worker services                                                     |
| `Option.`                                          | 125 / 28               | —                                                                   |
| `Either.`                                          | 109 / 14               | **src: 100% test files**; apps: `background.ts`, `messenger.ts`     |
| `Match.`                                           | 102 / 16               | `ui/tool.tsx`, `chat-agent/hooks.ts`, `connect/*`                   |
| `Effect.fn("name")`                                | 101 / 46               | `billing/service.ts` (9), `x-sync/*`                                |
| `Schema.TaggedError`                               | 99 / 31                | 31 `errors.ts`-style files                                          |
| `Effect.runPromise`                                | 68 / 33                | 25 prod + 8 test files                                              |
| `Effect.withSpan`                                  | 65 / 30                | —                                                                   |
| `Effect.either`                                    | 55 / 14                | **all test files** → `Effect.result`                                |
| `catchTag(` / `catchTags(`                         | 47 / 17, 46 / 27       | `x-sync/effects.ts` (15), `connect/x.ts` (13)                       |
| `@effect/vitest` import                            | 39 files               | unit + 1 e2e                                                        |
| `Schema.Defect`                                    | 33 / 18                | TaggedError `cause` fields                                          |
| `Context.Tag` declarations                         | 33 / 17                | see C2/C4/C6/C7                                                     |
| `LogLevel.` / `Logger.withMinimumLogLevel`         | 33 / 13, 30 / 12       | test helpers + `logger.ts`                                          |
| **`Schema.Date` (wire)**                           | **30 / 1**             | **`src/livestore/schema.ts` — every `Events.synced`**               |
| `Deferred`                                         | 29 / 1                 | `__tests__/unit/process-link-concurrency.test.ts`                   |
| `catchAll(` / `catchAllCause(` / `catchAllDefect(` | 19 / 14, 17 / 7, 9 / 7 | —                                                                   |
| `Schema.brand`                                     | 18 / 1                 | `db/branded.ts` (17 brands)                                         |
| `Layer.effect` / `Layer.provideMerge`              | 15 / 10, 14 / 7        | —                                                                   |
| `Effect.gen(this, …)`                              | 15 / 4                 | the 4 DO classes                                                    |
| **`Schema.DateFromNumber`**                        | **12 / 1**             | `src/livestore/schema.ts` SQLite columns                            |
| `Effect.runSync`                                   | 7 / 3                  | `logger.ts` `logSync` shim                                          |
| `Effect.unsafeMakeSemaphore`                       | 5 / 3                  | `durable-object.ts` ×2, `process-link.ts`, test ×2                  |
| `Logger.replace(Logger.defaultLogger, …)`          | 4 / 3                  | `logger.ts`, `link-processor/logger.ts`, `x-sync/durable-object.ts` |
| `ManagedRuntime`                                   | 4 / 2                  | **`apps/extension/` only**                                          |
| `Effect.zipRight` / `zipLeft`                      | 3 / 2, 2 / 1           | trivial                                                             |
| `Schema.parseJson`                                 | 3 / 2                  | → `Schema.fromJsonString`                                           |
| `Runtime.runPromise` + `Effect.runtime<R>()`       | 1                      | `workflows/account-deletion.ts:76`                                  |
| `@effect/opentelemetry`                            | 2 / 1                  | `src/cf-worker/tracing.ts`                                          |
| `Stream.async`                                     | 2 / 2                  | `apps/extension` → `Stream.callback`                                |
| `Effect.runFork`                                   | 2 / 2                  | `sync/index.ts`                                                     |

- [ ] **C1 — Dep + vendor + build plumbing (12 files, M)** — both package.jsons, `.gitmodules`, submodule SHA, `tools/livestore-local.ts` (verify, likely no change), 3 vitest/vite configs, the `@effect/rpc` patch (delete), 4 Node scripts. Sharp edges: upstream pins react 19.2.3 vs our 19.2.6 (PR #80 dual-React class — re-verify dedupe); `apps/extension` does NOT go through `livestoreLocalResolve()` (consumes the published snapshot with its own effect copy — must bump same commit); `vitest.e2e.config.ts` `ssr.noExternal` lists `effect` + `@effect/` + `@livestore/` — re-check after consolidation. Order: **first** (= Sequenced step 2).
- [ ] **C2 — Worker core spine (23 files, L)** — tracing, `AppLayerLive`, runtime, logger, db/auth/settings/billing services. 3 `Context.Tag` here, 3 `Effect.Service`, the 2 `@effect/opentelemetry` imports, 17 `Schema.brand`. Sharp edges: `tracing.ts` is a rewrite (no drop-in v4 form); the two WeakMap layer caches (`runtime.ts`, `billing/routes/runtime.ts`) exist BECAUSE v3 memoization didn't span `Effect.provide` — v4 changed exactly this; `logger.ts` `logSync` runs `Effect.runSync` with only a Logger layer. Order: second.
- [x] **C3 — LiveStore schema/events/queries + client store + frontend Effect surface (10 files, M — highest consequence)** — `src/livestore/schema.ts` (538L): 30 `Schema.Date` wire fields + 12 `Schema.DateFromNumber` columns; upstream `ddd1aa16c` proves v4 changed the Date wire form (their fix: `Schema.DateFromString.check(Schema.isDateValid())`). Events are immutable + persisted in prod eventlogs — needs the golden round-trip fixture (matrix rows 1–2) in the same commit. Order: third, before C4/C5/C7. **Landed 2026-08-09 — see step 6 Executed C3 block; recount: 18 wire + 12 column fields.**
- [x] **C4 — LinkProcessorDO pipeline + metadata (27 files, L)** — 8 `Context.Tag` in `services.ts`; `Effect.unsafeMakeSemaphore` ×3 (class fields crossing the non-Effect boundary); `liveLayer` of 7 merged layers rebuilt per link (memoization change lands here); 4 `catchAllDefect` recovery paths that null the cached Store. Order: after C2+C3, parallel with C5. **Landed 2026-08-09 — see step 6 Executed C5+C4 block; includes the do-rpc adapter-drift migration (syncUpdateRpc storeId recovery arg).**
- [x] **C5 — Sync backend glue (7 files, M — high blast radius)** — small API surface, all mechanical, but: `sync/index.ts` monkey-patches `setInterval` to prove the no-timer hibernation property — extend to `setTimeout` (v4 runtime may never call setInterval, blinding the probe); `getEventlogMax()` greps `eventlog_*` (verified unchanged at `2e4bcfc68`, re-verify at final SHA). Order: after C2, land with C4 as a pair. **Landed 2026-08-09 — probe extended to setTimeout, see step 6 Executed C5+C4 block.**
- [x] **C6 — HTTP surface: routes, connect, admin, invites, ingest, billing routes, account-deletion (42 files, L by volume)** — 11 `Context.Tag`; heaviest `catchTag` density (`connect/x.ts` 13, `connect/telegram.ts` 11); `Schema.parseJson` ×2 → `fromJsonString`. Sharp edge: `workflows/account-deletion.ts:76` is the repo's only `Effect.runtime<R>()` + `Runtime.runPromise` — bridges into CF Workflows `step.do()`; a wrong translation silently disables workflow retries. Order: after C2, parallel with C7. **Landed 2026-08-09 — see step 7 Executed C6 block; bridge = `Effect.context` + `runPromiseWith`, rejection semantics probe-verified; both filterMap sites fixed; check:effect at repo-wide ZERO.**
- [x] **C7 — Background feature workers: telegram, x-sync, x-enrichment, weekly-digest, chat-agent, queue-handler (50 files, L)** — 11 `Context.Tag` + 2 `Effect.Service`; highest `catch*` density (`x-sync/effects.ts` 15); `x-sync/durable-object.ts` `get baseLayer` rebuilds AppLayerLive per `runEffect` call — worst-case memoization exhibit; `telegram/bot.ts` reaches AppLayerLive only transitively (tracing convention holds only transitively). Order: after C2+C3. **Landed 2026-08-09 — see step 7 Executed C7 block; hotspot 8 PASSED 4/4 first-ever v4 run; baseLayer rebuild preserved verbatim.**
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

| #   | Risk                                                                          | Silent-failure mode                                                                                                                                                               | Concrete check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Gate    |
| --- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 1   | v4 changed `Schema.Date` wire encoding (vendor `ddd1aa16c`)                   | v4 store fails to decode existing eventlog `args` (materializer ParseError), or writes an encoding v3 can't read after rollback; server stores `args` opaquely so no server error | Sweep wire `Schema.Date` → `Schema.DateFromString.check(Schema.isDateValid())`; audit the 12 `Schema.DateFromNumber` columns stay epoch-number. New `src/livestore/__tests__/event-wire-format.test.ts`: encode every event against **golden JSON captured on `main` (v3) first**; flip branch must pass identical goldens                                                                                                                                                                                                                                                  | G2      |
| 2   | Eventlog replay of real rows (both directions)                                | Goldens can miss fields; only real rows prove it                                                                                                                                  | New pool-workers e2e `eventlog-format-compat.test.ts`: seed SyncBackendDO storage with fixture rows exported from `.wrangler/state/v3/do/cloudstash-SyncBackendDO/*.sqlite` (fork-written `eventlog_7_*` + `context_7` incl. `backendId`), boot LP client, assert materialized links + no `BackendIdMismatchError`. Reverse: flip-branch-written rows replayed on `main` **before** cutover                                                                                                                                                                                 | G2      |
| 3   | DO persistence format drift                                                   | A version bump (7→8) on a later pinned SHA silently orphans prod `eventlog_7_*` — v4 serves an empty log, clients fork                                                            | Verified at `2e4bcfc68`: version 7 both sides; upstream deleted `rpc_subscription_7` (clean orphan) → KV keys `rpc-sub:*`. **Hard checklist item keyed to the FINAL SHA:** `git -C vendor/livestore diff 36dd15dac <finalSHA> -- packages/@livestore/sync-cf/src/cf-worker/do/sqlite.ts packages/@livestore/sync-cf/src/cf-worker/shared.ts` — version still 7, table names unchanged                                                                                                                                                                                       | G2      |
| 4   | Hibernation regression from the fiber-runtime rewrite                         | Idle SyncBackendDO bills full residency again (~1,300×); nothing functional breaks                                                                                                | v4 `Effect.never` verified timer-less (`callback(constVoid)`); upstream parks on `Layer.launch`/`Stream.never`. Run upstream's `tests/sync-provider/src/do-hibernation.test.ts` + `do-rpc-hibernation.test.ts` in the submodule at the pinned SHA. Keep + **extend the `liveLongTimers` probe to wrap `setTimeout`**. Post-cutover: `type:hibernation` GB-s vs the day-before baseline                                                                                                                                                                                      | G2 + G4 |
| 5   | msgpackr eval under Workers CSP after dropping the `@effect/rpc` patch        | First record-struct decode on the LP↔SB DO-RPC path throws "Code generation from strings disallowed" in prod only                                                                 | Verified: effect v4 statically imports `msgpackr@2.0.4` (no `index-no-eval`), do-rpc still uses `RpcSerialization.msgPack`, BUT msgpackr 2.0.4 has a CF-Workers fallback (`inlineObjectReadThreshold = Infinity`). Checks: e2e do-rpc pass in workerd (codegen forbidden like prod); post-build `grep -c "inlineObjectReadThreshold" dist/cloudstash/index.js` ≥ 1 and `grep -c "msgpackr-extract" …` = 0; preview ingest smoke. **G2 share DONE 2026-08-10 (step 10 receipts): e2e green in workerd, build asserts ×3/×0; preview ingest smoke remains (G3)**              | G2 + G3 |
| 6   | Dual effect (or react) copies in the prod bundle                              | Broken `Context`/`Layer` identity at runtime only; typecheck green (PR #80 class)                                                                                                 | Post-build assert **inside `bun run build`**: exactly one `moduleVersion = "` hit, zero `3.21.2` hits, react singleton grep. **DONE 2026-08-10 (step 10 receipts): verify-bundle all-pass — marker ×1, `3.21.2` ×0, react `[19.2.6]` exactly**                                                                                                                                                                                                                                                                                                                              | G2      |
| 7   | v4 global Layer memoization changes instantiation counts                      | Module-scope layers (`Billing.Default`, `AppSettings.Default`, `OtelTracingLive`) become per-isolate singletons; a service capturing request-1 context serves request-2           | Unit test: `Layer.effect` build-counter provided via two separate `Effect.runPromise(Effect.provide(…))` calls; assert + document the v4 count. E2e: two sequential authed requests in one isolate through billing/settings. Audit module-scope layers closing over `env`. **DONE 2026-08-10 (partial): C2 probes (unit claim) + `layer-memoization.test.ts` services-rebuild-per-provide detector; layer-object reuse is by construction (WeakMap), `getBillingLayer` + direct-`AppLayerLive` sites review-only — see step 10 receipts**                                   | G2      |
| 8   | Deployed v3 clients vs v4 server (published Chrome extension + open SPA tabs) | Extension/tabs silently stop syncing after cutover; saves queue local-only in OPFS                                                                                                | G3: run the current published extension against the preview backend — confirm clean local queuing; confirm the v4 extension build reads v3-written OPFS (`liveStoreStorageFormatVersion = 6` both refs — verified) and drains the queue. Submit the v4 extension to the Web Store **before** prod cutover. G4: watch push deliveries + extension errors through the window. **Local share DONE 2026-08-10 (step 10 receipts): HTTP contract + wire goldens + storage-format-6 parity + WS-schema statics; live preview smoke, OPFS drain, Web Store submit remain (G3/G4)** | G3 + G4 |
| 9   | Test harness self-destruction (`@effect/vitest` 0.29 → beta.99)               | Tests pass vacuously or the pool won't boot                                                                                                                                       | Peers verified compatible (`vitest ^3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |         | ^4`; ours 4.1.7; pool-workers peer `^4.1.0`). After the bump: temporarily flip one assertion per suite family to confirm failures still fail; full unit + e2e | G2  |
| 10  | From-source build marker died with the fork                                   | Alias regression silently ships the published snapshot                                                                                                                            | Vite define when alias active: `__LIVESTORE_BUILD__ = "vendored@<sha>"`; post-build grep = 1, and = 0 under `LIVESTORE_PUBLISHED=1` (validates the marker itself)                                                                                                                                                                                                                                                                                                                                                                                                           | G2      |
| 11  | OTel layer compile break (`@effect/opentelemetry` 0.63 → beta)                | None at runtime — `OtelTracingLive` is currently a no-op (exporter disabled)                                                                                                      | Typecheck against the beta subpaths or migrate to `effect/unstable/observability` (vendor re-exports `Otlp`). "Validate traces on preview" is vacuous until the exporter is re-enabled — separate post-swap item                                                                                                                                                                                                                                                                                                                                                            | G2      |
| 12  | Un-revertable side effects riding the flip PR                                 | Rollback restores code but the deploy command's `d1 migrations apply --remote` already mutated D1                                                                                 | **The flip PR must contain zero D1 migrations** (migrations-dir diff empty); anything needing D1 lands in a separate earlier PR                                                                                                                                                                                                                                                                                                                                                                                                                                             | G2      |

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
- 2026-08-09 — **C3 Date wire idiom:**
  `const EventDate = Schema.DateFromString.check(Schema.isDateValid())`
  (hoisted shared const, applied to all 18 wire fields) for v3 `Schema.Date`;
  `Schema.DateFromMillis` for all 12 v3 `Schema.DateFromNumber` columns.
  Chosen over v4 `Schema.Date` (now `instanceOf(Date)` — encodes to a Date
  instance, decode rejects strings) because it byte-preserves the v3 wire:
  encode `Date → toISOString()` (v4 `SchemaTransformation.dateFromString`
  encode = `Formatter.formatDate` = `toISOString()`), decode `new Date(s)` +
  validity check, identical string acceptance (v4 `DateString` is
  un-narrowed `Schema.String`). Shared-const form of upstream `ddd1aa16c`'s
  inline idiom (upstream itself shares `DateValid` as a const; Schema values
  are immutable, reuse is safe). Proven against 29 v3-runtime-encoded
  synthetic goldens + 11 real fork-written eventlog rows, all 40
  byte-identical round-trips. Eventlog `schemaHash` drift is warning-only
  (`rematerialize-from-eventlog.ts:65`) and re-registers — decode is the
  compatibility gate.
- 2026-08-09 — **C5+C4 pattern: `Schema.optionalWith(S, { default: () => v })`
  → `S.pipe(Schema.withConstructorDefault(Effect.succeed(v)))`** (v4 has no
  `optionalWith`). Preserves the observable v3 contract for this repo's error
  classes: constructor/`.make` may omit the field and gets the default, Type
  side stays non-optional, explicit values win (all probe-verified, incl.
  literal-union fields like `ContentExtractionError.reason`). Deliberately
  does NOT add `withDecodingDefault`: none of these TaggedErrors are ever
  schema-decoded in this repo (in-process construction + catchTag only), and
  the decode-side default would make the Encoded key optional — surface we
  don't use. Template for the remaining `schema-optionalWith-manual` markers
  (telegram/errors.ts ×5 in C7, queue-handler ×2 in C7).
- 2026-08-09 — **C5+C4 mechanical patterns:** `Effect.gen(this, fn)` →
  `Effect.gen({ self: this }, fn)` (beta.99 overload; vendor idiom, e.g.
  sync-cf `durable-object.ts:148`); `Schedule.compose(Schedule.recurs(n))`
  → `Schedule.upTo({ times: n })` (upstream's own idiom; retry counts +
  exponential delays probe-identical); `Effect.zipRight(x)` →
  `Effect.andThen(x)` (lazy re-evaluation probe-verified). TaggedErrorClass
  supports `override get message()` getters unchanged (sync/errors.ts's 6
  message getters survive verbatim).
- 2026-08-09 — **C7 pattern: v3 `new ServiceClass(shape)` test stubs →
  `ServiceClass.of(shape)`.** v4 `Context.Service` classes have a
  `new (_: never)` constructor whose instances DON'T carry the shape (the
  runtime KeyClass constructor is a no-op) — `Layer.succeed(X, new X(shape))`
  compiles nowhere and at runtime provides a method-less object
  (`x.method is not a function`, or downstream defects). `X.of(shape)` is the
  v4 identity helper with the same inference ergonomics; the shape object
  passes through unchanged, so mock semantics are untouched. Applied in 5
  test sites (process-link ×3 via one replace, process-link-concurrency,
  enricher, runner ×2, billing.test ×1); the remaining v3 `new Billing`/`new
AppSettings` sites live in C6/C8-boundary test files (see Found issues).
- 2026-08-09 — **C7 mechanical patterns:** `Effect.timeoutFail({duration,
onTimeout: () => err})` → `Effect.timeoutOrElse({duration, orElse: () =>
err})` (TaggedErrorClass instances are yieldable failing Effects, so the
  orElse form fails with the same error; source still interrupted on
  timeout); `Effect.zipLeft(e)` → `Effect.tap(() => e)` (run-after-success +
  discard-result + propagate-failure, v3-identical; v4 tap takes function
  form only); `Schema.Schema.Type<typeof X>` → `typeof X.Type` (C3's
  services.ts idiom, applied to weekly-digest rpc + generator).
- 2026-08-09 — **v4 `Array.filterMap` takes a `Result`-returning filter,
  not Option** — Option-returning callbacks are discarded wholesale at
  runtime (`Result.isSuccess` gate fails on `Some`). Bridge an Option
  pipeline with a terminal `Result.fromOption(() => null)`. Same
  silent-failure family as `Option.fromNullable`/`Schema.DateFromNumber`:
  invisible to check:effect, only running code catches it.
- 2026-08-09 — **C6 CF Workflows bridge (Hotspot 6):** `Effect.runtime<R>()`
  - `Runtime.runPromise(rt)(body)` → `const services = yield*
Effect.context<R>()` + `Effect.runPromiseWith(services)(body)`. Beta.99
    removed the v3 `Runtime` value runtime (the v4 `Runtime` module is runMain
    plumbing); `runPromiseWith(context)` is the interop that carries captured
    services, and it is the vendored source's own bridge idiom
    (livestore store.ts:1271, StoreRegistry.ts:300, ws-rpc-server.ts:189).
    Rejection semantics probe-verified against a fake retrying `step.do`
    (scratchpad, repo deps): (a) typed TaggedErrorClass failure → Promise
    REJECTED → step retried to its limit (3 attempts at limit 2); (b) defect
    (thrown) → rejected + retried identically; (c) success → resolves, single
    attempt. CF per-step retries therefore survive the migration. v4 rejection
    value = `causeSquash(cause)` — the ORIGINAL error instance with `_tag` +
    fields intact (v3 rejected a FiberFailure wrapper), so
    `WorkflowOrchestrationError.cause` now holds the typed error directly:
    structurally richer for triage, but `String(cause)` no longer embeds
    nested messages — source of the 2 category (c) test reds (Found issues).
- 2026-08-09 — **D1 verified clean**: migrations at `0013_lonely_giant_girl`
  (14 journal entries), tree clean, no pending/uncommitted migrations; the
  flip requires no schema change. Matrix row 12 stays as a guard against
  riders landing on main between now and the merge.
- 2026-08-10 — **Build marker design (matrix row 10, implemented):**
  `tools/livestore-local.ts` exports `livestoreBuildValue()` —
  `vendored@<short-sha>` (`git rev-parse --short HEAD` in `vendor/livestore`
  at config-eval time) when the alias is active, `"published"` otherwise —
  and `livestoreBuildDefine()` wiring it as the `__LIVESTORE_BUILD__` Vite
  define in `vite.config.ts` + BOTH vitest configs (worker code referencing
  the global must resolve under every pipeline, incl. pool-workers). Ambient
  type in `src/ambient.d.ts`. Referenced exactly once, at worker-entry module
  scope: `logger.debug("livestore build", { build: __LIVESTORE_BUILD__ })` —
  a side-effectful entry-module call survives tree-shaking, Debug level is
  filtered at the default Info minimum (zero prod log noise), no new
  endpoint. Post-build: `scripts/verify-bundle.ts` (wired into `build` AND
  `build:prod` right after `vp build`) asserts QUOTED marker ×1 (bare-substring
  counting broke on the published build — "published" appears 34× in prose
  strings), `"3.21.2"` ×0, `inlineObjectReadThreshold` ≥1,
  `msgpackr-extract` ×0 (matrix row 5), and the react singleton (row 6) as:
  distinct react-major `\b19.x.y\b` version strings across
  `dist/client/assets/*.js` == exactly `[package.json react version]` — the
  PR-#80 dual-React failure ships upstream's differing react pin as a second
  distinct version string, and version strings are the only stable
  minification-surviving anchor (probed on the real bundle: backtick-quoted,
  6 occurrences, 1 distinct).
- 2026-08-10 — **tsgo cliff remediation pattern (sanctioned "simplify the
  construction"):** both residual-sweep checker blowups were DUAL TYPE
  IDENTITIES of one library in one program, fixed by unification, zero casts:
  ① root `vite` 8.0.3 → **8.0.14** (dedupes with the 2e4bcfc68
  devtools-vite's nested `vite@8.0.14`, installed because its peer `^8.0.16`
  rejects 8.0.3 — main's old snapshot shared root vite, the flip split it);
  ② `overrides: { "@cloudflare/workers-types": "4.20260531.1" }` (published
  @livestore packages pulled nested 4.20251118.0 copies); ③
  `src/cloudflare-workers-types-bridge.d.ts` + tsconfig `paths` pin — see
  Found issues for the dual-entrypoint mechanics; ④ `vite.config.ts` typed
  against REAL vite's `UserConfig` + a local `declare module "vite"`
  augmentation for the vite-plus-only keys (staged/fmt/lint), because
  vite-plus-core BUNDLES its own 2.5 MB copy of vite's types and comparing
  real-vite plugin values against that bundled copy is the depth-cliff
  construct; vp's `defineConfig` is a runtime pass-through for non-lazy
  configs (source-verified), so the exported object is identical.

## Found issues

_(running list — every surprise found during migration gets a line here)_

- 2026-08-10 (user local manual smoke — the de-facto CUTOVER DRESS
  REHEARSAL: fork-written `.wrangler` state opened by upstream v4 WITHOUT
  `clean:local-state`, i.e. exactly what prod DOs + browser OPFS stores
  will do on first boot post-deploy). Result: zero data loss, links
  visible, paste/Telegram single/6-link-burst all processed, AI summaries
  - tags fine, post-hibernation cold-DO recovery worked, one
    ServerAheadError rebase recovered per protocol. Three observations:
  1. **1k+ `Schema hash mismatch for event definition
v1.LinkProcessingFailed` WARNs at first boot.** Mechanism
     (source-verified): eventlog rows are stamped at commit time with
     `Schema.hash(eventDef.schema)` (`materialize-event.ts`); effect v4's
     `Schema.hash` differs from v3's, and the v4 table-schema hashes also
     differ → migrationsReport rebuilds the state tables → FULL
     rematerialize-from-eventlog replays every historical row and warns
     per row whose stored v3 hash ≠ current v4 hash
     (`rematerialize-from-eventlog.ts:65`). HARMLESS: the real gate is
     the `Schema.decodeUnknownEffect` that follows each warn — it passed
     on the user's entire ~10k-event real history (wire-preservation/C3
     goldens doing their job live). One-time per client store; replay of
     the full log took ~60ms. Residual cosmetic cost: pre-migration rows
     keep their v3 hashes forever, so any FUTURE rematerialization
     (e.g. a table-schema change) re-spams the warning for old rows.
     G4 expectation: this spam will appear once per DO + per browser
     client on first post-deploy boot — expected, not an incident.
     `clean:local-state` turned out to be UNNECESSARY (orphaned fork
     registry tables coexist fine — planning note ④ was right).
  2. **SyncBackend logs `ServerAheadError` at ERROR level**
     (`do/transport/do-rpc-server.ts` logs the handler-failure cause)
     before the client's normal rebase handles it. Protocol-normal per
     CLAUDE.md; cosmetic log-level noise in prod tails; upstream tweak
     candidate (downgrade to debug for ServerAheadError specifically).
  3. One link failed with `AiCallError`/`TimeoutError` (YouTube playlist,
     no content extracted) — pre-existing app-level AI timeout class,
     NOT migration-related; the failure path worked end-to-end (new
     `v1.LinkProcessingFailed` committed + synced under v4, Telegram
     notified "failed").

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
- 2026-08-09 (C8a) — **matrix row 1 reproduced in unit tests before the C3
  sweep exists:** every store-backed test (68 tests / 11 files) fails with
  `SchemaError: Expected number, got 2026-01-01T10:00:00.000Z` during
  materialization — v4 changed the `Schema.Date` wire form exactly as vendor
  `ddd1aa16c` predicted. The failure is ASYNC: the store's materialization
  fiber dies, the store shuts down, and every later `commit`/`query` throws
  `UnknownError: Store has been shut down` — the SchemaError root cause is
  only visible at `logLevel: "Debug"`. These 68 failures are C3's
  ready-made red suite; they must flip green in the C3 commit.
- 2026-08-09 (C8a) — **`Option.fromNullable` / `Option.flatMapNullable` do
  not exist in beta.99** (v4 kept `Option.fromNullishOr`); 7 prod files still
  call them (stripe-sync, build-digest-links, generate-summary,
  durable-object, trigger-digest, x-enrichment/usage, metadata/schema) and
  fail at RUNTIME with TypeError, invisible to `check:effect`'s error count —
  18 test failures today. Also runtime-only: `Effect.yieldNow` is now a
  value, not a function (`yield* Effect.yieldNow`). The class to remember:
  check:effect silence ≠ v4-clean; only running code proves it.
- 2026-08-09 (C8a) — v4 semaphores moved to a dedicated module:
  `Effect.makeSemaphore`→`Semaphore.make`, `Effect.unsafeMakeSemaphore`→
  `Semaphore.makeUnsafe`, type `Effect.Semaphore`→`Semaphore.Semaphore`;
  instance method `.withPermits(n)` unchanged. Prod's 3 sites (C4) still
  pending.
- 2026-08-09 (C8a) — baseline nuance for the scoreboard: `stripe-sync.test.ts`
  and `build-digest-links.test.ts` were ALREADY failing before C8a (the
  baseline's only 23 failing tests) — on the same removed Option APIs, not on
  harness debt. The harness crash (`test-helpers.ts`) import-killed 45+ other
  suites.
- 2026-08-09 (C8a) — vitest dedupes identical module-eval errors across
  suites: 19 import-dead suites printed ONE shared `Schema.TaggedError is not
a function` block whose stack goes through `telegram/services.ts` (first
  v3 module evaluated) — per-suite blocker attribution needs the module
  graph, not the error text.
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
- 2026-08-09 (stage 3, C2) — worker log lines now print `[Warn]` where v3
  printed `[Warning]`: v4 `LogLevel` is a string union and the custom logger
  interpolates it directly (v3 interpolated `logLevel._tag`). Same telemetry
  class as the errorTag note above — saved log queries matching `[Warning]`
  stop matching. All other level strings unchanged.
- 2026-08-09 (stage 3, C2) — v4 `Logger.Options` dropped the `annotations`
  field: custom loggers must read
  `options.fiber.getRef(References.CurrentLogAnnotations)`, which is a plain
  readonly record (v3 passed a HashMap). Pattern for the remaining
  `Logger.make` site (link-processor/logger.ts, C4).
- 2026-08-09 (stage 3, C2) — cluster residuals are cross-cluster type poison,
  not C2 work: `connect/errors.ts` (6 × v3 `Schema.TaggedError`; its
  `SessionLookupError` is imported by org/service, api-key-gate, and
  billing/routes/shared) and `account-deletion/prepare.ts` +
  `account-deletion/runtime.ts` (v3 TaggedErrors) leave 5 errors anchored in
  org/service.ts + auth/index.ts. Also NEWLY surfaced `checkout.ts:85` once
  `runBilling`'s types became real — same root file. Two-file mechanical fix,
  deferred to C6 per cluster scoping. (Landed as C8a's boundary pre-fix.)
- 2026-08-09 (stage 3, C2) — expected cascade breathing, error total fell for
  the first time (297→272): making Billing/AppSettings real types cleared 16
  cluster errors and surfaced new `missingEffectContext: unknown` reds only
  in dependents (x-initialize-watermark.test 0→8, x-poll-once.test 2→15,
  connect tests, checkout.ts 0→1) — all in their own clusters' backlog.
- 2026-08-09 — Effect language-service v4 integration confirmed accounted
  for: `@effect/language-service@0.87.2` auto-detects the installed Effect
  major and switches rule sets (v3-only rules off, v4 `outdatedApi` on) — no
  config change needed; the same package serves both the `check:effect` CLI
  and the editor tsserver plugin. Editor needs a TS-server restart after the
  dep bump to load the new plugin version.
- 2026-08-09 (C2 RG review) — three call sites bypass the `getAppLayer` cache
  and mint `AppLayerLive(env)` fresh per request: `index.ts:262`,
  `queue-handler.ts:166`, `auth/index.ts:260`. Pre-existing, harmless today
  (cache is inert anyway) — but any future cross-request MemoMap plan
  (matrix row 7) must migrate them to `getAppLayer` first.
- 2026-08-09 (C2 RG review) — log-format drift inventory, third entry: paths
  using Effect's DEFAULT logger (no `runWithLogger`) also changed shape with
  the dep bump — v4 prints `[HH:MM:SS.mmm] INFO (#n): …`. Together with
  `[Warning]`→`[Warn]` and `errorTag` `TimeoutException`→`TimeoutError`:
  update any saved log queries after cutover.
- 2026-08-09 (C2, repo pattern) — **OTel tracing on v4:**
  `OtelTracer.layerGlobal.pipe(Layer.provide(Resource.layer({...})))` from
  `@effect/opentelemetry/OtelTracer` + `/Resource` subpath imports (the
  modules the vendored source itself uses). beta.99 kept `layerGlobal` and
  `Resource.layer` with an unchanged config shape — the "rewrite" is a module
  rename (`Tracer` → `OtelTracer`). No-op preserved: `layerGlobal` reads the
  global otel provider, which stays unregistered (exporter still disabled).
  When re-enabling OTLP later, the split `layerTracer`/`layerGlobalProvider`
  (or vendor's `OtelLiveDummy` style: `Layer.succeed(OtelTracer.OtelTracer,
tracer)` + `layerWithoutOtelTracer`) is the v4-native seam.
- 2026-08-09 (C2, repo pattern) — **WeakMap layer caches (`appLayerCache`,
  `billingLayerCache`): KEEP, reclassified harmless.** Source-verified in BOTH
  versions: v3 3.21.2 `provideSomeLayer` → `buildWithScope` → fresh
  `makeMemoMap` per call; beta.99 `provideLayer` → `buildWithScope` →
  `CurrentMemoMap.forkOrCreate` → fresh map when absent from fiber context
  (i.e. every top-level `runPromise`), entries ref-counted and finalized when
  the request scope closes. So services rebuild per request in v3 AND v4 —
  the caches never delivered cross-request instance sharing and v4 changes
  nothing. Not harmful either (keyed by `env` object → no stale capture).
  Kept because a stable per-env layer identity is the prerequisite for any
  future cross-request MemoMap (matrix row 7) and v4's parent-forking of
  nested provides keys on it. Comments at both sites corrected.
- 2026-08-09 (C2, repo pattern) — **Schema.TaggedError v4 shape:**
  `class X extends Schema.TaggedErrorClass<X>()("Tag", fields) {}` — the
  identifier argument deliberately OMITTED (defaults to tag). Vendor passes
  `~@livestore/pkg/X` identifiers, but v4's `makeClass` sets `Error.name`
  from the identifier — adopting that form would rename `error.name`
  observable through `safeErrorInfo` log fields; tags are already unique in
  this single-app repo. Field-level: `Schema.Defect` → `Schema.Defect()`
  (now a constructor call), `Schema.Literal(...spread)` →
  `Schema.Literals(array)`, `Schema.optional` unchanged. Runtime-verified:
  instances remain YieldableError Effects (yield\*/flatMap positions), `.make`
  static intact, catchTag(s) narrowing intact, `_tag` = `name` = tag.
- 2026-08-09 (C2, repo pattern) — **Effect.Service v4 shape:** hoist the
  implementation to `const make = Effect.gen(...)`, declare
  `class X extends Context.Service<X, Effect.Success<typeof make>>()("@cloudstash/X")`
  with `static readonly Default = Layer.effect(X, make)` inside the class
  body. Rationale: beta.99 has no `Effect.Service`; vendor idiom is
  `Context.Service` + separate make/layer (`000e8cb93`); deriving Shape via
  `Effect.Success<typeof make>` avoids hand-written interfaces; the `Default`
  static preserves every existing `X.Default` call site unchanged (AppLayerLive
  - link-processor/durable-object + activity-stats/handler +
    weekly-digest/run-digest). Applies to the remaining 3 `effect-service-manual`
    markers (weekly-digest, x-enrichment, activity-stats) in their clusters.
- 2026-08-09 (C3) — **the 68-test store-shutdown killer was the COLUMN
  schema, not the event args schema:** `Schema.DateFromNumber` does not exist
  in beta.99, and `State.SQLite.integer({ schema: undefined })` silently
  falls back to `Schema.Finite` (`field-defs.ts` `makeColDef` `??` chain) —
  no import error, no type error surfaced. The materializer's insert of a
  decoded `Date` arg then fails at `sql-queries.ts:285` column ENCODE with
  `Expected number, got 2026-01-01T10:00:00.000Z` (v4's formatter renders
  Date instances via `toISOString()`, masquerading as a string-typed value).
  Byte-exact repro: `Schema.encodeResult(Schema.Finite)(new Date(...))`.
  Same lesson as the `Option.fromNullable` entry: a nonexistent v4 member
  read off a namespace is `undefined`, not an error, and check:effect stays
  silent.
- 2026-08-09 (C3) — **v4 `Schema.URL` = `instanceOf(URL)`** — decoding a
  string now ALWAYS fails, so top-bar.tsx's
  `Option.isSome(Schema.decodeUnknownOption(Schema.URL)(text))` URL
  detection (clipboard chip + submit validation) was silently
  always-false under v4. Fixed with `Schema.URLFromString` (string → URL,
  same acceptance as v3: probe-verified valid/invalid/bare-word). Same
  `Date`-class rename pattern: v3 transform schemas became `instanceOf`
  declarations with `*FromString` variants carrying the old semantics.
- 2026-08-09 (C3) — **`bun run test:ext` is red at base `3242c4e`** (4/11
  fail, pre-existing, NOT caused by C3): `messages.test.ts` dies inside
  effect@3.21.2 Schema internals (`parser is not a function` /
  `map.get(candidate) is not a function`) — cross-instance AST breakage in
  the extension's mixed v3 subtree. `ci.yml` line ~89 still runs `test:ext`,
  so CI stays red even with the two sanctioned extension steps commented
  out. Boundary decision for the user: gate `test:ext` the same way (same
  TEMP rationale) or fix the v3 subtree resolution in the fast-follow.
- 2026-08-09 (C3) — importing the extension's v3 `@livestore/livestore`
  snapshot for golden generation fails in the mixed tree:
  `Cannot find module '@effect/opentelemetry/Otlp'` from the v3
  `@livestore/utils` store dir (its peer resolves to root's beta.99
  @effect/opentelemetry, which dropped that subpath). Golden generation
  therefore used v3 **effect** directly with the livestore wrapper stubbed
  (wire-equivalent: the wrapper never touches args encoding). Remember for
  C9: the extension's runtime imports may hit the same class of cross-tree
  peer resolution once anything nudges the lockfile.
- 2026-08-09 (C2) — **`Schema.brand` needs NO migration:** beta.99 kept the
  pipeable `Schema.String.pipe(Schema.brand("X"))` combinator with `.Type`
  and a same-shape throwing `.make` (`Bottom.make`) — all 17 brands in
  `db/branded.ts` and every `Brand.make(...)` call site are v4-valid as-is.
  The inventory's "17 Schema.brand" line is a no-op for the whole repo.
- 2026-08-09 (C5+C4) — **Hotspot 8 (`process-link-concurrency.test.ts`) has
  STILL not executed under v4** — the plan expected it runnable in this unit,
  but it (and `process-link.test.ts`) import-crashes on OUT-of-scope C7
  files: `x-enrichment/errors.ts` (v3 `Schema.TaggedError` module-eval
  TypeError, reached via `process-link.ts` → `enricher.ts`) and
  `x-enrichment/generator.ts` (v3 `Effect.Service` — same crash class; the
  test also constructs `new EnrichmentGenerator(...)` directly). Left
  unfixed per unit scoping (boundary blockers reported, not fixed). The
  interleaving-assertion signal the migration most needs is therefore
  deferred to C7 — make these two files C7's FIRST items and re-run
  hotspot 8 immediately.
- 2026-08-09 (C5+C4) — `sync/__tests__/validate-payload.test.ts` (C5's own
  suite) is import-blocked by the C7 telegram chain (`auth/service` →
  `account-deletion/runtime` → `telegram-key-store.live` →
  `telegram/services.ts` v3 TaggedError). Its 16 check:effect diagnostics
  cleared with sync/errors.ts; only the runtime import blocks. Same chain
  blocks importing `sync/index.ts` outside workerd, so the extended timer
  probe is exercised only by e2e (G2).
- 2026-08-09 (C5+C4) — the sole in-scope residual diagnostic
  (durable-object.ts:396 `missingEffectContext: any`) is C7 poison, not C4
  debt: `liveLayer` merges `EnrichmentGenerator.Default` +
  `OpenRouterApiKeyLive` whose classes still extend v3 `Effect.Service`
  (types resolve to `any`). Clears when C7 migrates those two files to the
  C2 `Context.Service` pattern.
- 2026-08-09 (C5+C4) — upstream `syncUpdateRpc` payload type is
  `Uint8Array<ArrayBuffer>` (generic `Uint8Array` — TS ≥5.7 syntax); the
  published-snapshot d.ts carries the same type, so tsgo resolves it. The
  old `payload: unknown` signature would no longer satisfy
  `ClientDoWithRpcCallback`.
- 2026-08-09 (C5+C4 RG review) — **account-deletion purge-ordering race,
  widened by the always-recover path**: the deletion workflow purges
  LinkProcessorDO BEFORE SyncBackendDO (`workflow.ts:113-123`), while the SB
  keeps the LP's `RpcSubscription` in KV — a push landing in that gap now
  re-boots the store on the just-purged LP DO and re-creates eventlog tables
  permanently. Pre-existing window (purgeAll never cleared `this.storeId`);
  the recovery wiring extends it to evicted instances. Cheapest full fix:
  swap purge order (SB first) in the account-deletion workflow — out of the
  migration's scope, tracked for the deletion doc/kanban.
- 2026-08-09 (C5+C4 RG review) — optional hardening: `syncUpdateRpc` could
  assert `this.ctx.id.name === storeId` like `fetch`/`ingestAndProcess` do
  (defense-in-depth only — trust analysis showed a wrong-store delivery is
  structurally impossible without server-storage corruption).
- 2026-08-09 (C7) — **HOTSPOT 8 RESOLVED: PASS.** The interleaving suite
  (`process-link-concurrency.test.ts`, 4 tests: stalled-AI-doesn't-block-
  metadata, permit-release ordering, AI-lane cap, metadata-lane cap) ran
  under the v4 fiber runtime for the first time and passed 4/4 with zero
  changes beyond two API forms (`new EnrichmentGenerator(…)` → `.of`, plus
  the C7 prod-file unblocks). The feared fiber-rewrite scheduling drift did
  not materialize — the Deferred-synchronized design (RG-codemod finding 5's
  explicit `{startImmediately: true, uninterruptible: "inherit"}`) held.
- 2026-08-09 (C7) — **TWO SILENTLY-BROKEN out-of-scope `Arr.filterMap`
  sites remain**, same runtime-only class that produced build-digest-links'
  8 reds: `connect/telegram.ts:231` (Option-returning callback — telegram
  disconnect would delete ZERO API keys) and
  `admin/activity-stats/metrics.ts:192` (`Option.none()` returns — retention
  cohorts always empty). Both compile and pass check:effect. C6 MUST fix
  both (grep `filterMap` before closing C6); no test currently covers the
  connect/telegram one at runtime.
- 2026-08-09 (C7) — boundary blockers left for C6, verified precisely: ①
  `connect/services.ts` v3 `Schema.TaggedError` import-kills 7 suites
  (connect ×3, raycast-connect, ingest-service, create-invite-body, and
  C7's own `telegram/__tests__/resolve-public-url.test.ts` via
  telegram/connect-prompt → connect/telegram — the ONLY C7-colocated suite
  still red). ② `account-deletion/workflow.ts:51`
  (`WorkflowOrchestrationError`) kills its own suite — C8a's boundary
  pre-fix covered prepare.ts/runtime.ts but not workflow.ts. ③ v3
  `new Billing({…})`/`new AppSettings({…})` stubs in
  auth/**tests**/{api-key-gate,hooks}.test.ts (9 reds; includes the
  api-key-gate `Effect.exit smoke` assertion failure — root-caused to the
  method-less stub instance, NOT v4 behavior) and in the three
  import-blocked connect tests + raycast-connect (latent behind ①). ④
  `admin/trigger-digest.ts` still calls removed `Option.fromNullable`
  (runtime TypeError when the admin digest-trigger route runs; C6).
- 2026-08-09 (C6) — **CATEGORY (c), the migration's first and only two:**
  `account-deletion/__tests__/workflow.test.ts` "on a runtime method
  failing" + "purgeXBookmarkSync failure" — both assert
  `expect(String(error.cause)).toContain("<op> boom")`. Under v3,
  `Runtime.runPromise` rejected with a FiberFailure whose string rendering
  embedded the nested cause message; v4 `runPromiseWith` rejects with
  `causeSquash(cause)` = the raw `DeletionRuntimeError` instance, whose
  `String()` is just the tag (no message getter, nested Error lives in the
  `cause` FIELD, which `String()` never renders). The prod bridge is
  CORRECT — rejection still fires (retries proven), and the structured
  error is richer for triage than v3's wrapper; only the stringified
  observable changed. Left failing per the prime directive (fixing means
  changing the assertion to look inside `cause.cause` — an assertion
  change, so it belongs to the user/reviewer, not this unit). These are
  the only 2 non-green unit tests on the branch (1290/1292).
- 2026-08-09 (C6) — **another silent module-eval crash class instance:**
  `Schema.int` / `Schema.positive` / `Schema.lessThanOrEqualTo` do not
  exist in beta.99 (checks are `Schema.isInt()` / `isGreaterThan(0)` /
  `isLessThanOrEqualTo(n)` applied via `.check(...)`, and there is NO
  `isPositive` — positive = `isGreaterThan(0)`).
  `invites/service.ts`'s `CreateInviteBody` called all three inside
  `Schema.Number.pipe(...)` → `undefined()` TypeError at module eval,
  import-killing every invites route. Same lesson as
  `Option.fromNullable`/`DateFromNumber`: nonexistent namespace members
  are `undefined`, check:effect stays silent, only running code proves it.
  `create-invite-body.test.ts` 12/12 green on the `.check` form.
- 2026-08-09 (C6) — **v4 renamed the schema decode failure: `ParseError`
  → `SchemaError`.** `admin/trigger-digest.ts` kept
  `catchTag("ParseError", …)` — compiled fine as dead code (catchTag on a
  tag the error union doesn't contain), so an RPC-shape decode failure
  would have fallen through as an unhandled SchemaError (500 via
  runHandler) instead of the intended 502 DigestRpcDecodeError. Grep-swept
  the repo: zero other stale `ParseError` tags (all remaining hits are the
  app's own `MetadataParseError`).
- 2026-08-09 (C6) — unit-test TOTAL grew 1191 → 1292 with zero test-file
  additions: the 9 formerly import-dead suites register their full test
  counts once their prod imports evaluate. Scoreboard comparisons across
  units must use per-suite numbers, not the total.
- 2026-08-09 (C6) — e2e harness notes for G2: the pool-workers suite runs
  clean under v4 end-to-end (hotspot 9 admin.test included — the
  @effect/vitest × pool-workers three-way pin holds). The 3 skips are the
  stranding post-mortem's own pre-existing `describe.skip` durability
  suites (un-skip decision belongs to step 10/G2, gated on the #722
  durability barrier question). Miniflare's workflows binding logs
  "Engine was never started" / "instance.not_found" uncaught-exception
  noise while delete-account polls workflow status — assertions all green;
  don't chase it.
- 2026-08-09 (C6) — v4 type-helper renames confirmed while clearing the
  last check:effect errors: `Effect.Effect.Success<T>`/`Effect.Effect.Error<T>` →
  `Effect.Success<T>`/`Effect.Error<T>`; type-level `Schema.Schema<A, I>`
  → `Schema.Codec<A, I>` (v4 `Schema.Schema` takes one parameter). The two
  checkers have NON-OVERLAPPING blind spots on this class: check:effect
  flagged the ingest/service.ts site (`any` leaking into E) but stayed
  silent on the identical form in invites/service.ts, which only tsgo
  caught (TS2724); a clean check:effect does NOT imply the class is gone —
  the residual sweep should grep `Effect\.Effect\.` and `Schema\.Schema<`
  (73 typecheck errors remain, all listed in the Executed C6 scoreboard).
- 2026-08-10 (residual sweep) — **tsgo nondeterminism characterized; root
  constructs found and removed.** (1) Sequential stability: 4 clean-tree runs
  were byte-identical (73 errors) — the historical 7/94/73/0 spread did not
  reproduce run-to-run; the variance axis is checker STATE, proven directly:
  the exact vite.config.ts content that errors `TS2321 Excessive stack depth`
  in the full program typechecks CLEAN in an isolated one-file project. The
  cliff constructs were cross-identity deep-recursive comparisons (real-vite
  `Plugin` values vs vite-plus-core's BUNDLED 2.5 MB copy of vite's types;
  plus a second vite identity the flip introduced — the 2e4bcfc68
  devtools-vite's peer `^8.0.16` rejects root 8.0.3, so bun nested a private
  vite@8.0.14 where main's old snapshot had shared root vite). Any check-order
  or cache difference near that depth budget flips which comparisons blow up →
  different error subsets. All unified away (Decisions 2026-08-10); after the
  fix, 10+ runs produced identical zero-error output. (2) One residual
  transient REMAINS possible: a single run (immediately after node_modules
  churn) reported 5 phantom `TS2307 Cannot find module 'vitest'` errors in
  e2e files, gone on every subsequent run — smells like a resolution-cache
  race in tsgo's concurrent resolver on a cold FS cache. Not reproduced in
  10+ warm runs; if it recurs in CI, re-run before digging.
- 2026-08-10 (residual sweep) — **@cloudflare/workers-types dual-entrypoint
  hazard** (the durable-object.ts:740 / chat-agent:171 class): the package
  ships TWO declaration sets — `index.d.ts` (GLOBAL ambient; the only
  declarer of `module "cloudflare:workers"`; merges with lib DOM's
  Request/WebSocket/Headers in this repo's single fullstack tsconfig) and
  `index.ts` (pure module exports). Under `moduleResolution: "bundler"` a
  bare import (as in @livestore/common-cf's `CfTypes`) resolves the MODULE
  variant, so `handleSyncUpdateRpc(ctx: CfTypes.DurableObjectState)` and
  `this.ctx` (global) were structurally incompatible (DOM-merged Request has
  cache/credentials/… the module Request lacks; strada tsc 6.0.3 agrees —
  NOT a tsgo defect). Paths-pinning the specifier to `index.d.ts` was
  REJECTED: it is not a module, so `CfTypes` silently degrades to any
  (probe: garbage args accepted). Fix:
  `src/cloudflare-workers-types-bridge.d.ts` — a module that re-exports the
  14 names livestore's d.ts actually consumes as ALIASES OF THE GLOBALS —
  paths-mapped over the specifier; wrong args still rejected (probe-verified)
  and a missing name fails loudly. Plus `overrides` deduping the nested
  4.20251118.0 copies to root 4.20260531.1.
- 2026-08-10 (residual sweep) — **REAL BUG the typecheck union caught:
  ChatAgentDO.syncUpdateRpc was still the fork-era 1-arg form** — since the
  flip it called upstream's 2-arg `handleSyncUpdateRpc` as
  `handleSyncUpdateRpc(payload)`, i.e. ctx=payload/payload=undefined: every
  do-rpc live-pull delivery to a ChatAgentDO would throw at runtime.
  Invisible to check:effect; no unit or e2e test exercises chat-agent
  live-pull delivery (C5+C4 migrated only the LinkProcessorDO callback).
  Migrated to the upstream 2-arg shape (`this.name` is the storeId source,
  so no LP-style storeId-recovery wiring needed — WRONG, corrected post-review:
  cold idFromString wakes can't read `this.name`; the RPC storeId arg is now
  used, and a single-flight store-boot guard was added). Chat-agent live-sync
  smoke belongs on the G3 preview checklist.
- 2026-08-10 (residual sweep) — **scripts/ were silently v3-broken since the
  flip**: `scripts/mock-ingest/*` + `scripts/check-pricing.ts` still used
  `Effect.either`/`Either.*`, v3 `Schema.TaggedError` (module-eval crash on
  first run) and `Stream.asyncPush`. scripts/ are excluded from
  tsconfig/typecheck AND check:effect; the only net was `vp check`'s
  import-namespace lint, whose errors surface PROGRESSIVELY (fixing one
  reveals the next in the same file). All migrated
  (`Result`, `TaggedErrorClass`, `Stream.callback` + `Queue.offerUnsafe`);
  TaggedErrorClass runtime-smoked under bun — RG-corrected: check-pricing.ts
  was NOT covered (3 v3 TaggedError classes + v4-removed
  `ConfigProvider.fromMap`/`Layer.setConfigProvider`); migrated post-review
  (`ConfigProvider.make` map-provider + `orElse(fromEnv())` + `layer`) and
  smoked end-to-end against Stripe (all prices match). Lesson for step 10:
  `vp check`
  lint is the only automated coverage scripts/ get — keep it green.
- 2026-08-10 (residual-sweep RG review) — post-review fixes applied by the
  orchestrator: ① chat-agent `syncUpdateRpc` now uses the RPC `storeId` arg
  (cold-wake recovery; `this.name` throws pre-hydration) + single-flight
  `storeCreationPromise` guard (PR-#30 concurrent `createStoreDoPromise`
  class — chat-agent lacked LP's funnel while the always-recover path added
  a new concurrent caller); ② `scripts/check-pricing.ts` fully migrated
  (TaggedErrorClass ×3, `Literals`, `ConfigProvider.make`+`orElse(fromEnv)` +`layer` replacing v4-removed `fromMap`/`setConfigProvider`) and smoked
  live. Re-verified after: typecheck 0, unit 1292/1292, e2e 52/3-skip,
  vp check green. Chat-agent live-pull still has NO test coverage — G3
  preview smoke remains the gate for it.
- 2026-08-10 (residual-sweep RG review) — bun.lock note: vite bump left a
  redundant nested `wxt/vite@8.0.3` subtree (extension workspace only, bun
  conservatism; `bun update wxt` in the fast-follow dedupes it). vite 8.0.14
  published 2026-05-21 — well outside the cooldown window.
- 2026-08-10 (step 10, row-7 probe) — **pool-workers `vi.mock` scope is
  direct-imports-only:** a module mock intercepts ONLY when the test file
  itself imports the mocked module (string and typed `import()`-form
  registration behave the same); modules reached TRANSITIVELY (probed: via
  `../../runtime` one hop up, via the worker entry, static or dynamic) and
  the SELF-dispatched worker graph never see the mock — the factory is
  simply never invoked, no error. A worker-internal `AppLayerLive`
  build-counter spy is therefore impossible without an app-code hook. The
  shipped row-7 e2e observes the claim mock-free instead: direct
  entry-`fetch` calls put test + handlers in one module registry with one
  shared `env` reference, so `getAppLayer(env)` referential identity spans
  the request window, and a `runHandler` probe captures per-provide service
  instances. If an exact build count is ever needed: export a counter (or
  the WeakMap) from `runtime.ts` — the smallest possible hook.

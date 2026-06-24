# Post-mortem — SyncBackendDO billable-duration incident & the `Effect.never` / DO-hibernation fix

> **Status:** Mitigated in production via local `patches/`. ⚠️ **This is our own attempt, not a confirmed-correct fix.** The proper fix is being worked out upstream in LiveStore — [livestorejs/livestore#1328](https://github.com/livestorejs/livestore/issues/1328). When that lands, our patches should be dropped and the approach re-validated. See [Open / revisit](#open--revisit).
>
> **Timeline:** root cause found 2026-06-11 · first fix shipped 2026-06-12 ([cloudstash#78](https://github.com/bohdanbirdie/cloudstash/pull/78)) · superseded by the surgical patch 2026-06-14 · investigation closed 2026-06-15.

This doc supersedes and consolidates two earlier working docs (the long investigation log + an app-agnostic upstream handoff brief). All workspace/store/account identifiers have been scrubbed.

---

## ⚠️ TEMPORARY — DO-hibernation fix: local `@livestore/*` patches DROPPED; fix now lives in the livestore clone (PR #1338) via `LIVESTORE_LOCAL` (remove this section once the fix ships in a published snapshot)

> Updated 2026-06-24. The rest of this doc below is the stable post-mortem.

**Strategy switch (2026-06-24): stop hand-rolling local patches; consume the fix from the livestore clone instead.** The two `@livestore/*` bun patches were **removed** from this branch. The hibernation work now lives upstream in the livestore clone (`local/livestore`, branch `bohdan/fix/do-hibernation-chain` = [PR #1338](https://github.com/livestorejs/livestore/pull/1338)), reached locally via `LIVESTORE_LOCAL=1` (`bun run dev:local`) — see [[architecture/livestore-local-source-linking]]. That clone is the single source of truth for livestore changes now; no more patch/snapshot round-trips.

**What changed in this repo (2026-06-24):**

- Removed `patches/@livestore%2Fcommon-cf@…` and `patches/@livestore%2Fsync-cf@…` + their `patchedDependencies` entries. **Kept `@effect/rpc@0.75.1`** (unrelated CSP/serialization patch).
- The `common-cf` patch also carried an unrelated **msgpackr stream-drain fix** — removing it drops that from normal mode too (it lives in the clone).
- **Reset local DO state** (`bun run clean:local-state` → wipes `.wrangler/state/v3/{cache,do,kv,workflows}`). Required because the old patch persisted a `rpc_subscription_7` table with column **`subscribedAt`**, while the clone's version of the same table uses **`generation`** (never version-bumped); `CREATE TABLE IF NOT EXISTS` never reconciles columns, so a stale table → `no such column: generation`. `bun install` does not touch `.wrangler/state`.

**The full fix set (LiveStore agent's #1–#5) and where each lives now:**

| #   | Fix                                                        | Makes hibernate / recover                                      | Status                                                                                                         |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| #1  | timer-less server parks ①②③                                | **SyncBackendDO** hibernates                                   | in the clone (#1338); was in our patches (now removed)                                                         |
| #2  | DO-RPC subscription persistence                            | LinkProcessor stays fed after the SyncBackendDO evicts         | in the clone (#1338); was in our patches (now removed)                                                         |
| #3  | client transport park                                      | the **LinkProcessorDO itself** hibernates                      | in the clone (#1338)                                                                                           |
| #4  | client live-pull wake-recovery (`onHibernatedUpdate` seam) | LinkProcessor live-pull recovers after **its own** hibernation | library seam in the clone (#1338); **host wiring** (`recoverStore` in `durable-object.ts`) is NOT in this repo |
| #5  | browser self-heal (`LeaderSyncProcessor` catch-up)         | —                                                              | ⛔ **non-starter — dropped on both sides**                                                                     |

**Consequence — normal mode / deploy is now UNPATCHED.** Plain `bun run dev` and any deploy from this branch run the published snapshot, which has **none** of #1–#5 — so the SyncBackendDO idle-billing fix + DO-RPC persistence are **lost outside `dev:local`** until either [#1338](https://github.com/livestorejs/livestore/pull/1338) merges and cloudstash bumps to a snapshot that includes it, or the patches are re-derived from the merged version. **If this branch deploys to prod, prod loses the fix.**

**#5 stays dropped** — the browser-side `LeaderSyncProcessor` catch-up pull the agent proposed; we applied it (attempt #4) and reverted it, and the agent confirmed it "stays reverted — confirmed clean."

**Still open even via the clone:** #4's **host wiring** (a `recoverStore`/`onHibernatedUpdate` hook in `durable-object.ts`) is not in this repo. Tests 1–3 below **all passed without it** — including an idle→hibernate→wake→catch-up cycle (Test 3) — consistent with the attempt-#3 finding that our **app-level fetch trigger (cold-start)**, not the reverse-RPC path #4 targets, is the dominant wake path. #4 looks **unnecessary for our topology**; final call deferred to a published-snapshot bump.

### Validation against the clone — in progress (2026-06-24)

Dropping the patches is **not** the end of this work — it's the switch to clone-based validation. We have **not** declared the LinkProcessorDO-hibernation half done: #3 (the LinkProcessorDO can now hibernate) is new to us and historically **wedged** in attempts #1–#3, so we validate PR #1338 against our actual wake topology on `dev:local` (fresh store after `clean:local-state`) before relying on it or bumping to a published snapshot.

**Test 1 — rapid-succession warm path (2026-06-24). PASS.** 6 distinct links POSTed to `/api/ingest` in a **~110 ms burst** (the warm path that cold-starts mask, and the one that wedged in attempts #1–#3). All 6 reached `Summary generated` → `LinkSummarized` and rendered in the UI; **no `ServerAheadError`, no push wedge**; `SyncBackend DO woke up` + `liveLongTimers:0` throughout (hibernation working, timer-free). The clone's #1–#3 hold the path our hand-rolled patches couldn't.

**Issue surfaced → handed to the LiveStore agent (PR #1338):** at the start of the burst, two **unhandled** `NoSuchElementException`s from the DO-RPC sync client's push at leader boot (`rpc-sync-client:push` → `LeaderSyncProcessor:boot`, `do-rpc-client.ts`). **Non-fatal** — the leader push retry/backoff self-heals once the first pull sets `backendId`, and all 6 synced. Root cause = a `backendId` **boot race**: it's `None` until the first pull `lazySet`s it (`do-rpc-client.ts:102`, from `makeBackendIdHelper`/`sync-backend-kv.ts`), and an `Option.getOrThrow` runs on the still-`None` value at boot; exposed here because `clean:local-state` left the client KV empty. Awaiting the agent's take.

**Test 2 — 500-link warm burst (2026-06-24). PASS.** 500 distinct links POSTed to `/api/ingest` (~163 req/s enqueue), drained through the queue (5-wide batches, `max_concurrency=1`) → LinkProcessorDO → SyncBackendDO. To avoid burning inference, the `LinkProcessorAi` layer was **temporarily** swapped for a fake (100–300 ms `Effect.sleep` + fixed output; reverted after — a one-file layer swap, no flag). Eventlog head **141 → 3141** (exactly 500 × 6 events), contiguous + stable; **all 500 created and completed, 0 burst failures**, no `MaterializeError`, no stuck head. Browser rendered all ~519 links with summaries.

**Test 3 — 1000-link idle-then-burst (2026-06-24). PASS.** After a few minutes idle (DOs hibernated), 1000 distinct links burst-fired (same fake-AI layer). Eventlog **3146 → 9146** (exactly 1000 × 6), all created + completed, **0 burst failures, 0 in-flight, head stable** — **~2.8× past the historical "stuck at 3288" wedge**. Hibernation confirmed at runtime: on a post-drain page refresh, `SyncBackend DO woke up` + `Launching WebSocket Effect RPC server`, then a clean catch-up pull. The DO hibernated **on idle after the drain**, woke on the new connection, and served the full set correctly — the hibernate-on-idle → wake-on-connect → correct-catch-up cycle the whole effort targets.

**Observation (client-side, not the fix).** During the 1000-event fast drain the browser's **live WebSocket push lagged** — UI sat at 1324 of 1519 until a refresh forced a fresh pull → 1519. Backend was complete the entire time (head 9146, 0 in-flight); **no data loss**. This is a livestore client live-push characteristic under extreme burst (plus React rendering ~1500 links), **separate** from DO hibernation/billing; any reconnect catches up. Low-priority; optionally relayable to the LiveStore agent.

**Still to run:** two-tab live cross-client sync on the clone (add in tab A → appears live in tab B; delete propagates). Billing (actual DO `type:hibernation` GB-s) is confirmable **post-deploy only**.

### History — attempt #3 (the wake-recovery fix, reverted)

Implemented all three pieces below (timer-park + library `onHibernatedUpdate` hook + host `recoverStore`/`waitUntil` — i.e. our hand-rolled #3 + #4). On-device result: the **processor side was solid** — every link cold-started after a >30 s idle gap and processed to `Summary generated`. But the **browser still wedged**: a link processed fully on the backend, yet its summary never reached the UI, and the _next_ link produced only the metadata-preview logs (no `Push received {v2.LinkCreated}`) — preceded by a single non-converging `ServerAheadError`.

**Key insight from the trace (the open risk above):** our processor is **not** woken by the livestore reverse-RPC `syncUpdateRpc` path #4 targets. Every link shows `Waking up processor` → `fetch called (triggerLinkProcessor)` → `Creating store` — an **app-level fetch trigger** (SyncBackendDO explicitly `fetch`es the LinkProcessorDO on a push) that **cold-starts** the processor with a fresh catch-up pull. So the processor head is never stale via #4's mechanism, the `onHibernatedUpdate` recovery is barely on the active path, and the browser-side wedge happened regardless. **Reverted to #79** (the LinkProcessorDO was never the billing whale — orders of magnitude smaller than SyncBackendDO; resident is acceptable for now).

<details><summary>(Superseded) the wake-recovery fix as implemented — kept for the next attempt</summary>

**Status: the naive client park was confirmed bad → root-caused by the LiveStore agent → implemented → on-device validation FAILED (browser still wedges, see above).**

### Why the naive park failed (settled)

Re-applying just the timer-less DO-RPC **client** park reproducibly **wedged the browser client's pushes** (on a clean store, both stores identical signature: a new link yields only the main-worker metadata-preview logs, no `Push received {v2.LinkCreated}`, no processing; the wedge persists in OPFS until client-state clear). This also overturned the earlier "exonerated" call — the wedge outlives a patch revert because it's written to OPFS.

The LiveStore agent reproduced it deterministically and found the **real root cause is NOT flush-ordering** (the park is byte-faithful to `withRun`): it's a **wake-recovery gap**. Once the processor DO can hibernate, its in-memory `requestIdMailboxMap` + leader pull-fiber are wiped, and `handleSyncUpdateRpc` **silently drops** the reverse-RPC live update (the `No mailbox found for …` log). The processor stops receiving → its head goes stale → its own pushes fork the shared log → the browser client wedges on non-converging `ServerAheadError`. All downstream of that one gap.

### The fix (implemented here)

Three pieces — **all three are required together**; the park alone is the broken state:

1. **Timer-park (re-applied)** — `@livestore/common-cf` `do-rpc/client.js`: `RpcClient.Protocol.make` → local `makeProtocol` parking on `holdForever = Effect.async(() => {})`. Lets the DO hibernate.
2. **Library hook** — `@livestore/sync-cf` `client/transport/do-rpc-client.js`: `handleSyncUpdateRpc(payload, options?)` no longer silently drops on a mailbox miss; it calls `options.onHibernatedUpdate()`. (`.d.ts` updated too.) Folded into our sync-cf patch.
3. **Host wake-recovery** — `link-processor/durable-object.ts`:
   - `recoverStore()` — deduped/idempotent: read persisted `storeId`, `ensureSubscribed()` (boot + catch-up pull + re-subscribe; the sync DO's per-caller keying retires the stale subscription).
   - `syncUpdateRpc` triggers recovery via **`ctx.waitUntil(recoverStore())`** on `this.cachedStore === undefined` (primary; works local + real CF) **and** via the `onHibernatedUpdate` hook (belt-and-suspenders for real CF). **Not awaited inline** — awaiting would re-enter the sync DO while it's awaiting this reverse-RPC.
   - Persist `storeId` at store boot (`createStoreInternal`) so a cold reverse-RPC wake (no storeId on the payload) can recover.
   - **Hazard C:** the fire-and-forget background work (`void runEffect(...)` processing, `sendProgressDraft`, `notifyResults`) is now wrapped in `this.ctx.waitUntil(...)` so a now-hibernatable DO isn't evicted mid-flight. (`cancelStaleLinks`/`ensureDigestScheduled` left unwrapped — both idempotent, self-heal on the next wake.)

Gotcha (CF eviction semantics, from the agent): trigger recovery off `cachedStore === undefined`, NOT the mailbox-miss hook alone — **local wrangler keeps module state on eviction** (new DO instance, but `requestIdMailboxMap` survives), so the hook won't fire locally; real CF tears the isolate down and it does. Wire both.

Bun gotcha: re-applying/reverting a patch needs `rm -rf node_modules/.bun/@livestore+{common-cf,sync-cf}@* node_modules/@livestore/{common-cf,sync-cf} node_modules/.vite && bun install` — a plain `bun install` reports "no changes" and keeps the stale content-hashed store copy.

### Validate before merge (restart the dev server first)

- **Functional:** with a 2nd client (browser) as writer, let the processor DO go idle/hibernate (>30 s), then push a link → confirm it re-boots (`Creating store` → `Subscription fired`), catches up, AND the browser **no longer** hits a non-converging `ServerAheadError` / wedge. Repeat several rounds incl. rapid-succession + content that forces the Workers-AI fallback.
- **Billing (post-deploy only):** confirm the LinkProcessorDO namespace actually hibernates via the platform DO-duration/GB-s metric — the local `setInterval` probe is unreliable (shared isolate).

Open upstream follow-up from the agent: promoting the ~20-line host recovery into an adapter-owned `createStoreDoPromise` wrapper so the host wouldn't hand-wire `syncUpdateRpc`.

</details>

---

## TL;DR

- A Cloudflare Durable Object only stops billing for idle wall-clock time if it can **hibernate**, and hibernation requires **zero pending timers**.
- Effect's `Effect.never` is implemented as a real `setInterval(() => {}, 2**31-1)`. LiveStore's WebSocket Effect-RPC server parks long-lived fibers on `Effect.never`, so the **SyncBackendDO could never hibernate** — it billed full idle residency (~176 s per wake) for every connected client, then got evicted and cold-started on the next message.
- Latent for ~9 months; surfaced as persistent WS sync clients grew (web app + Chrome extension). On 2026-06-11 it hit ~90% of the daily DO free-duration cap (13,000 GB‑s/day) and the namespace started getting disabled mid-day.
- Fix = replace the timer-backed parks with timer-less ones. **Production idle billing dropped ~1,300×** (from ~100% residency per hour to a few seconds), sync fully functional.

## Timeline

- **2025-08-29** — the parks have existed since LiveStore's first CF adapter (`Layer.launch` + `Stream.concat(Stream.never)` on live pulls). Latent for ~9 months because the free tier absorbed low connection volume.
- **~2026-05-22** — **load inflection**: persistent WS sync clients (web app, later the Chrome extension) start holding live-pull connections; billed residency climbs from ~1–4 s/day toward minutes-per-wake. Onset was staggered per workspace (organic usage), which ruled out a single code/deploy flip.
- **2026-06-11** — Cloudflare emails at ~90% of the daily DO free-duration cap. **Root cause found same day** (runtime timer-counting probe + code re-verification): `Effect.never`'s `setInterval` defeats WS hibernation.
- **2026-06-12** — **iteration-1 fix deployed** (global neuter, [cloudstash#78](https://github.com/bohdanbirdie/cloudstash/pull/78)); **prod-confirmed** on the heaviest workspace (numbers under [Fix history](#iteration-1--global-effectnever-neuter-shipped-then-superseded)).
- **2026-06-12 → 06-14** — billing held **flat over ~3 days** with no redeploy (clean daily canary).
- **2026-06-14** — finding **upstreamed** as [livestore#1328](https://github.com/livestorejs/livestore/issues/1328); local patch swapped global → **surgical 3-site** fix.
- **2026-06-14 → 06-15** — the surgical patch **unmasked a DO-RPC live-pull regression** (fixed via subscription persistence); a client-side park attempt was applied then reverted.
- **2026-06-15** — the **AI-processing scare** was isolated to corrupted client OPFS + a content-specific AI timeout (not the patch); a correction was sent to the LiveStore agent; investigation closed.

## Root cause (technical)

Hibernation disqualifier: a pending `setInterval` keeps a DO "idle but unable to hibernate," which Cloudflare bills as active wall-clock until eviction (~70–176 s). Cloudflare's own `keepAlive()` uses a 30 s **alarm**, not a timer — confirming alarms, not timers, are the hibernation-safe primitive. `Effect.never` (`effect/.../internal/core.js`) registers a `setInterval(() => {}, 2**31-1)`; it is harmless on a normal request but fatal inside a hibernatable DO.

Three fibers parked on `Effect.never` for the lifetime of each WS connection:

1. **`@livestore/common-cf`** `ws-rpc/ws-rpc-server.js` — `Layer.launch(ServerLive)` (the "Launching WebSocket Effect RPC server" log). `Layer.launch` parks on `core.never`.
2. **`@livestore/sync-cf`** `cf-worker/do/transport/ws-rpc-server.js` — the live Pull handler's `Stream.concat(Stream.never)` (`Stream.never = fromEffect(Effect.never)`). The browser client always pulls live.
3. **`@effect/rpc`** `RpcServer` / `withRun` — `run` does `Effect.onExit(Effect.never, …)`, reached via the `Protocol` LiveStore supplies in `makeSocketProtocol`. (This was the "3rd timer" that couldn't initially be located at a call site — see iteration 1.)

**Why live delivery survives hibernation:** `sync-cf` `push.js` broadcasts by re-enumerating `ctx.getWebSockets()` and each socket's persisted `pullRequestIds` attachment — both survive hibernation. The parked fiber only withholds the RPC `Exit`; it is **not** the delivery path. So removing the timer-backed park does not break live sync. This was verified at runtime (two-tab live add/delete, push→process pipeline) before shipping.

## Fix history

### Iteration 1 — global `Effect.never` neuter (shipped, then superseded)

[cloudstash#78](https://github.com/bohdanbirdie/cloudstash/pull/78) (squash `6e4d491`). `bun patch effect@3.21.2` → a timer-less `asyncInterrupt(() => sync(() => {}))` in dist esm+cjs `internal/core.js`, neutering **every** `Effect.never`.

Chosen because, at the time, `@effect/rpc` had no literal `never` we could pin (the 3rd timer couldn't be located at a call site), and a runtime probe proved **3** live `setInterval(2**31-1)` timers per idle connection — so neutering at the root was the only approach guaranteed to zero all three.

- **Result — production-confirmed (2026-06-12), before/after on the _same_ DO, same hour-of-day:**
  - Pre-fix, the busiest hour billed ~`7,200,008,234` µs (≈ 7,200 s ≈ 2 connections × 3600 s ≈ **100% residency**) → crossed the daily cap mid-day → namespace **disabled** for the rest of the UTC day.
  - Post-fix, the same hour-of-day with **more** connections billed ~`5,267,848` µs ≈ **5.27 s** → **~1,300× reduction**. Billing shape flipped to ~50 ms `hibernation` wakes; held **flat over ~3 days** with no redeploy.
  - **Deploy proven by** `scriptVersion 0f6190d8` + every "Push received" log carrying `liveLongTimers:0` (a field that only exists in the patched build) + **zero** `[hibernation-timer]` warnings all day.
  - **How confirmed (observability lookups):** Cloudflare GraphQL DO analytics — `durableObjectsInvocationsAdaptiveGroups` (per `objectId`×`type`×`date`: `type:hibernation` wakes vs `jsrpc`/`http` residency) and `durableObjectsPeriodicGroups { sum{activeTime} }` — cross-checked against Workers observability logs. (The query method + the account/namespace/store ids are kept in private agent memory, not here.)
- **Downsides that motivated superseding it:** too broad (changes Effect globally), and it forced a `node_modules/effect` un-symlink that orphaned nested devDeps (see [Gotchas](#gotchas-hit-along-the-way-tooling)).

### Iteration 2 — surgical 3-site fix + DO-RPC subscription persistence (current)

The 3rd timer **was** located: `@effect/rpc` `withRun`'s `run` = `Effect.onExit(Effect.never, …)`. Because LiveStore owns the `Protocol` (it builds it in `makeSocketProtocol`), a clean source-level fix is possible **without** patching `@effect/rpc`. This matches the approach in the upstream issue [#1328](https://github.com/livestorejs/livestore/issues/1328).

The shared primitive is a timer-less park: `const holdForever = Effect.async(() => {})` — never resolves, interruptible, registers no timer.

- **①** `common-cf` `ws-rpc-server.js`: `Layer.launch(ServerLive)` → `Layer.buildWithScope(ServerLive, scope)`.
- **③** `common-cf` `ws-rpc-server.js` `makeSocketProtocol`: stop using `RpcServer.Protocol.make` (= `withRun`); build the `Protocol` object directly with `run` = the `Mailbox` drain loop piped through `Effect.zipRight(holdForever)`. **①↔③ are coupled** — bare ① with ③ unfixed interrupts the message pump (RPC ping timeouts).
- **②** `sync-cf` `cf-worker/do/transport/ws-rpc-server.js`: `Stream.concat(Stream.never)` → `Stream.concat(Stream.fromEffect(Effect.async(() => {})))`.

The `effect@3.21.2.patch` was **deleted** — native `Effect.never` (with its `setInterval`) is back, and only the three WS-server sites are timer-less.

**DO-RPC subscription persistence (a required follow-on).** The LinkProcessorDO is a LiveStore _client_ hosted inside a DO; it subscribes to the SyncBackendDO for live-pull over **DO-to-DO RPC** (`createStoreDoPromise({ livePull: true })`). That subscriber registry was an in-memory `Map`, wiped when the now-hibernatable SyncBackendDO evicts — so after the WS fix let the SyncBackendDO hibernate, it would forget the subscriber on wake and stop pushing (broke AI processing). Fix: persist the registry in the sync DO's own SQLite (`rpc_subscription_*`, lazily `CREATE TABLE IF NOT EXISTS`, keyed per caller DO id), re-read on every push and pruned on delivery failure. No timers added → hibernation preserved.

### Side-quest — LinkProcessorDO client-side park (attempted, reverted, exonerated)

The DO-resident _client_ keeps its own `Effect.never` park (the DO-RPC client transport run-loop = `RpcClient.Protocol.make` / `withRun`), so the **LinkProcessorDO itself doesn't hibernate**. We tried the same `holdForever` swap in `common-cf` `do-rpc/client.js`. AI processing then appeared to break — **but the revert did not fix it**, so the client patch was **exonerated** (the real cause was the scare below). The client-side hibernation fix is therefore **unvalidated on our side and deferred** — see [Open / revisit](#open--revisit). The LinkProcessorDO was never the billing whale (the SyncBackendDO was, by orders of magnitude).

### Gotchas hit along the way (tooling)

These cost real time and will recur if the patches are re-rolled:

- **`bun patch` leaves shadowing real dirs.** Patching `@livestore/common-cf` / `@livestore/sync-cf` materialises top-level real dirs that **shadow the `.bun` store** but lack the sibling `@livestore/utils`, which breaks `@livestore/utils/effect` resolution → the dev server won't boot. **Fix after every `bun patch --commit`:** `rm -rf node_modules/@livestore/{common-cf,sync-cf} node_modules/.vite && bun install` (re-symlinks to the store).
- **Stale patched `effect` dir masks changes.** After deleting `effect@3.21.2.patch`, the old patched `node_modules/effect` real dir lingered and shadowed native `effect`, masking the surgical patch. **Fix:** `rm -rf node_modules/effect && bun install`.
- **iteration-1 only — `bun patch effect` orphans devDeps.** It un-symlinks `node_modules/effect` → real dir → orphans nested `fast-check` / `@standard-schema/spec` → build fails. Worked around by hoisting both as top-level devDeps. (Gone in iteration 2 — we no longer patch `effect`.)
- **Worker dist changes are not HMR.** They require clearing `node_modules/.vite` and a dev-server restart. The optimized-deps **bundle hash** (the `?v=…` in stack-trace paths) is the reliable "is my patch actually loaded?" signal — used it to prove the client-park revert was live.

## The 2026-06-15 AI-processing scare (not the patch)

After the surgical patch, AI summaries looked broken. Two independent, non-patch causes were isolated by a controlled test (a clean second workspace):

1. **Corrupted client OPFS** on one workspace — a diverged local eventlog producing a non-terminating `ServerAheadError` storm (the client kept re-pushing stale batches the server already had). A different workspace showed zero storm; logging out (clearing OPFS) + fresh login made it vanish on **both** patched and unpatched builds. So the storm was client-state corruption, **not** LiveStore and **not** our patches.
2. **A content-specific AI timeout** — certain pages reliably make the primary summariser model hang past the hard 30 s cap (`Effect.timeout("30 seconds")` wraps the whole `generate`, so a hang consumes the budget before the Workers-AI fallback runs). Fail-_fast_ models fall back fine; only a _hang_ trips it. Tracked separately in [[kanban]].

**Lesson:** causality was over-attributed twice from uncontrolled before/afters (cold-vs-warm DO start, store backlog, AI latency all varied). The controlled second-workspace test is what actually isolated the cause. `ServerAheadError` is a normal part of LiveStore's eventual-consistency rebase — a _storm_ of them that never converges signals a wedged/diverged client, not a server bug.

## Current patch inventory (what to remove when upstream lands)

| File                                    | Change                                                                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `patches/effect@3.21.2.patch`           | **deleted** (iteration-1 neuter removed; native `never` restored)                                                                                                                           |
| `patches/@livestore%2Fcommon-cf@…patch` | ① `Layer.buildWithScope`, ③ direct `Protocol` + `holdForever` in `ws-rpc-server.js` (also retains a pre-existing msgpackr stream-drain fix in `do-rpc/client.js` — unrelated to this issue) |
| `patches/@livestore%2Fsync-cf@…patch`   | ② timer-less live-pull park + the DO-RPC subscription persistence (`sqlite.js` / `layer.js` / `do-rpc-server.js` / `push.js`)                                                               |
| `package.json` / `bun.lock`             | `patchedDependencies` updated accordingly                                                                                                                                                   |
| `src/cf-worker/sync/index.ts`           | **temp probe** `liveLongTimers` — wraps `globalThis.setInterval`, warns on any `>1e6 ms` timer, annotates the "Push received" log. Remove once the upstream fix is in.                      |

> Note: with native `Effect.never` restored, `liveLongTimers` is **no longer a clean `0`/`1` signal** — LiveStore's sync machinery legitimately creates transient timer-backed parks (e.g. the push-fiber rebase). The reliable production signal is the SyncBackendDO `activeTime` collapse holding, not the probe count.

## Open / revisit

- **Upstream fix (primary follow-up):** track [livestorejs/livestore#1328](https://github.com/livestorejs/livestore/issues/1328). When LiveStore ships the hibernation fix, **drop our local patches**, remove the temp probe, and re-validate (prod `type:hibernation` GB‑s + sync end-to-end). Kanban task created for this ([[kanban]]).
- **LinkProcessorDO client-side hibernation:** still deferred and **unvalidated** on our side. Next step there is a _clean-store_ re-test of the client-side park fix, not a new patch. Secondary — it was never the billing driver.
- **AI fallback-timeout hardening:** the content-specific 30 s timeout — tracked in [[kanban]].

## Debugging notes (non-obvious — save future-you time)

- **Local-dev `liveLongTimers` is not trustworthy.** The temp probe wraps `globalThis.setInterval`; in local dev (`vite` + `workerd`, effectively a shared isolate) it counts timers across _all_ DO instances and **does not decrement on eviction**, so the number only climbs (we watched 1→6 across one session) and never returns to 0 even when every DO is healthy. Treat it as a coarse "is anything parking on a real timer" hint locally; trust the prod DO-duration metric for the real signal.
- **LinkProcessorDO cold-vs-warm changes the code path.** A _cold_ start (`Creating store` → fresh initial pull → `Subscription fired`) reliably processes pending links; a _warm_ DO has `ensureSubscribed()` early-return and depends entirely on live-pull delivering the new event. Because `>~10 s` idle evicts the DO, spaced-out test links all **cold-start** — which masks warm-path fragility. **To exercise the warm path, paste links in quick succession.** ("4 links, >10 s apart, all worked" looked like a passing test but was really 4 cold-starts.)
- **`storeId mismatch in fetch {expected:""}` is a benign red herring.** It's logged on a freshly-woken DO instance before `this.ctx.id.name` is bound; the handler then creates the store and proceeds normally. Don't chase it.
- **Live-pull reverse delivery ≠ the client transport.** Server→client live-pull goes `push.js` → `emitStreamResponse` → the client DO's `syncUpdateRpc` (`ClientDoWithRpcCallback`) → `handleSyncUpdateRpc`, which materialises it into the store. The client park we tried to make timer-less (`makeProtocolDurableObject` in `do-rpc/client.js`) is the client's _outgoing_ request/response loop — **not** this reverse path. Keep the distinction when re-attempting LinkProcessorDO hibernation.
- **Patches are keyed by exact snapshot version.** `patchedDependencies` pins the LiveStore snapshot hash; bumping LiveStore makes the patch silently fail to apply (bun warns). On upgrade, re-roll against the new version — or drop it if #1328 has landed.

## Related

- [[architecture/livestore-do-rpc-stream-stall]] — the DO-RPC stream-framing/stall fix (same packages; the msgpackr drain fix that this issue's common-cf patch also carries).
- [[architecture/livestore-do-rpc-bug-reproduction-study]] — earlier isolation study of that DO-RPC stream stall.
- [[todos/link-processor-stuck-after-eviction]] — LinkProcessor self-heal after DO eviction (the warm/cold start + `ServerAheadError` territory this post-mortem brushed against).
- [[todos/admin-server-ahead-alert]] — admin alerting for a stuck/diverged LinkProcessorDO sync (would catch the OPFS-storm class early).
- [[todos/server-ingest-durability]] — links lost when the DO backend is disabled (born directly from _this_ incident's cap-driven outage).
- [[todos/e2e-do-sync-testing]] · [[todos/managed-effect-runtime-do]] — adjacent DO-sync follow-ups.
- [[kanban]] — the "drop patches once #1328 lands" task + the AI fallback-timeout task.

## References

- Upstream issue (canonical fix tracking): <https://github.com/livestorejs/livestore/issues/1328>
- First-iteration fix PR (global neuter, superseded): <https://github.com/bohdanbirdie/cloudstash/pull/78>
- Reusable DO-duration analytics method (GraphQL `durableObjectsPeriodicGroups` / `durableObjectsInvocationsAdaptiveGroups`, `type:hibernation`/`jsrpc`/`http` breakdown) is kept in the private agent memory, not here (it references account/namespace ids).

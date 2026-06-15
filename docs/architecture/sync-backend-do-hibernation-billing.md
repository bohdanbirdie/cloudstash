# Post-mortem — SyncBackendDO billable-duration incident & the `Effect.never` / DO-hibernation fix

> **Status:** Mitigated in production via local `patches/`. ⚠️ **This is our own attempt, not a confirmed-correct fix.** The proper fix is being worked out upstream in LiveStore — [livestorejs/livestore#1328](https://github.com/livestorejs/livestore/issues/1328). When that lands, our patches should be dropped and the approach re-validated. See [Open / revisit](#open--revisit).
>
> **Timeline:** root cause found 2026-06-11 · first fix shipped 2026-06-12 ([cloudstash#78](https://github.com/bohdanbirdie/cloudstash/pull/78)) · superseded by the surgical patch 2026-06-14 · investigation closed 2026-06-15.

This doc supersedes and consolidates two earlier working docs (the long investigation log + an app-agnostic upstream handoff brief). All workspace/store/account identifiers have been scrubbed.

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

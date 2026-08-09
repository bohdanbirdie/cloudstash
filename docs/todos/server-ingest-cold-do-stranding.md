# Server ingest stranded on a cold LinkProcessorDO — link doesn't sync until the next push

**Status:** Diagnosed from prod logs 2026-06-25 (incident 2026-06-24 ~22:19–22:22 UTC). Root cause confirmed. A fix was drafted + e2e-validated on branch `fix/cold-do-stranding-leader-durability`, then **REVERTED and DEFERRED (2026-08-08)**: a major livestore version bump is imminent (breaking changes + many bug fixes) and may obviate this, so the app-core fix and the fork's `whenLeaderSynced` method were backed out rather than carried across the bump. **Kept as artifacts:** this post-mortem + the e2e reproduction (durability assertions `describe.skip`ped; the eviction-lever test still runs). See **Suggested fix (drafted & deferred)** and **Revisit after the livestore bump** below.

A link sent through a **server-side ingest channel** (Telegram / Raycast / public `POST /api/ingest`) can be committed to the LinkProcessorDO's **local** store but **never pushed to the SyncBackendDO eventlog**, so it is invisible everywhere (UI, refresh, even a fresh client) until the **next** ingest re-boots the DO and flushes the backlog. The account is healthy the whole time — this is a **delay/stranding** bug, not the account-wide-disabled **loss** bug in [[server-ingest-durability]].

## Symptom (user report, confirmed)

UI open ~1 hour (idle). User sent a link over Telegram → it did **not** appear in the UI. **Refreshing the page did not show it either.** User sent a **second** link over Telegram → **both** links appeared at once.

## Confirmed incident (prod logs, store `AJNipm2I…` = Bohdan's Pro workspace)

| Time (UTC)                  | Link                                                  | Event                                                                                                                                                                                                                       |
| --------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 22:19:35.601                | **#1** `impeccable.style/docs/distill` (`DOTJrcLtt…`) | `ingestAndProcess called` — **cold** DO (`hadCachedStore:false`, `hadSubscription:false`)                                                                                                                                   |
| 22:19:36.101                | #1                                                    | `Ingesting link from queue` + `Store created successfully`                                                                                                                                                                  |
| 22:19:38.251                | #1                                                    | `Queue message processed status=ingested` → `msg.ack()`                                                                                                                                                                     |
| _(gap)_                     | #1                                                    | **No `[SyncBackend] Push received` for #1. No processing. No `ingestAndProcess completed` log.**                                                                                                                            |
| 22:21:53.233                | **#2** `x.com/alex_barashkov/…` (`6KYsfcZY…`)         | `ingestAndProcess called` — **cold again** (DO evicted in the 2-min gap)                                                                                                                                                    |
| 22:21:55.103                | #2                                                    | `fetch called (triggerLinkProcessor)` (`hadSubscription:true`, `hadCachedStore:true`) ×3                                                                                                                                    |
| **22:21:55.719**            | **#1**                                                | **`Push received {batchSize:9}` — #1's ENTIRE event set finally flushes** (`v2.LinkCreated → LinkProcessingStarted → LinkMetadataFetched → LinkSummarized → TagSuggested×3 → LinkProcessingCompleted → LinkSourceNotified`) |
| 22:21:56.297 → 22:21:58.440 | #2                                                    | #2's events push and process                                                                                                                                                                                                |

**Both links surfaced at 22:21:55+, ~2 min after #1 was sent.** The browser never had a chance — #1's events simply were not on the server until #2's ingest woke the DO.

### Two hard proof points

1. **`ingestAndProcess called` = 3, `ingestAndProcess completed` = 0** in the sampled window (no error/warn/defect logged). The method (`durable-object.ts:602`) returns `{status:"ingested"}` to the queue (so `msg.ack()` runs and the _main worker_ logs `Queue message processed`), but the LinkProcessorDO's own completion log at `durable-object.ts:664` never flushes — the DO isolate is torn down the instant the RPC returns, dropping the buffered log **and** the in-flight background push.
2. **No `Push received` for #1 at 22:19**, then a single `batchSize:9` push at 22:21:55 carrying #1's complete pipeline. The events sat in the LinkProcessorDO's local SQLite the whole time and replayed when the next cold boot's livestore client drained its local backlog.

## Root cause

`ingestAndProcess` (`src/cf-worker/link-processor/durable-object.ts:602-671`):

1. `getStore()` (boot livestore client) → `ensureSubscribed()` → `ingestLink(...)` commits `events.linkCreatedV2(…)` to the DO's **local** livestore store.
2. Returns `{status:"ingested"}`. The queue handler (`queue-handler.ts:98-107`) logs + `msg.ack()`s.

But **pushing that committed event to the SyncBackendDO eventlog happens in the livestore client's background push fiber — it is not awaited and not held by `ctx.waitUntil`.** A Cloudflare DO stays alive only while there is an in-flight request or a registered `ctx.waitUntil` promise. The moment `ingestAndProcess` returns and the queue RPC completes, the LinkProcessorDO has no pending awaited work → CF evicts the idle isolate → the background **push fiber** (and the **processing** subscription on `pendingLinks$`) are killed before they run. The `linkCreatedV2` event is stranded in the DO's local store.

It only escapes on the **next** ingest: a fresh cold boot (`createStoreInternal`) re-opens the persisted local SQLite, the livestore client sees the un-acked local backlog, and pushes it — which is why #1 and #2 flushed together.

### Why a page refresh didn't help

The browser pulls from the SyncBackendDO eventlog. Link #1's `linkCreatedV2` was **never in that eventlog** until 22:21:55 — it lived only in the LinkProcessorDO's local store. So a refresh (fresh client → full pull) correctly found nothing. **The browser / sync client is innocent; the data wasn't on the server.**

## Why this is distinct from the related docs

- [[server-ingest-durability]] — account-wide **DO-disabled** (daily duration cap) → RPC/store-create throws → retry×3 → **DLQ (undrained)** → link **permanently lost**. Here the account is **healthy**, the DO boots fine, and the link is **delayed**, not lost (it self-flushes on the next ingest). Different failure, different fix.
- [[link-processor-stuck-after-eviction]] — a link **already on the server** stuck at `status=pending` with no terminal event because **processing** was killed mid-AI-call; fixed by a self-arming alarm / wake-on-connect that re-runs `ensureSubscribed`. Here the link's **`LinkCreated` itself never reached the server** — it isn't even "pending" anywhere visible; the gap is one layer earlier (the push, not the processing). That doc already notes (its line 61) "the link queue ACKs after `ingestAndProcess` returns 'ingested' (fire-and-forget)" — **this doc is the observed consequence of that.**

## Possible interaction with the DO-hibernation fix (#79/#80)

Likely **exacerbated, not caused**, by the hibernation work. The fire-and-forget push has always been un-held, but now that the SyncBackendDO hibernates and the system idles harder, server ingests almost always hit a **cold** LinkProcessorDO + a hibernating SyncBackendDO, widening the window in which the push hasn't completed when `ingestAndProcess` returns. Pre-fix, a resident SyncBackendDO + warmer LinkProcessorDO made the race far less likely to lose. Worth confirming whether the stranding rate rose after 2026-06-24.

## Secondary observation — `storeId mismatch in fetch {expected:""}`

Earlier in the same session (21:03:18, 21:04:14) the DO logged `[LinkProcessorDO] [Error] storeId mismatch in fetch {storeId:"AJNipm2I…", expected:""}` — a `triggerLinkProcessor` fetch (`durable-object.ts:564`) arrived **before** the cold DO had persisted its `storeId` (`expected:""`), so it 400'd. Same cold-start fragility, different entry point; the trigger races store creation. Returns a 400, dropping that wake. Worth hardening alongside the main fix (persist `storeId` / tolerate the race rather than 400).

## Suggested fix (drafted & deferred)

> **Deferred 2026-08-08 — NOT in the tree.** This fix was implemented and e2e-validated, then reverted pending the livestore bump. Everything below is the _proposed_ approach, preserved for when we revisit — the app-core changes (`durable-object.ts`), the fork's `whenLeaderSynced` method, and its type augmentation have all been backed out.

Not a livestore _bug_: `store.commit()` guarantees only a _local_ write; the push to the SyncBackendDO runs in a background fiber that never runs before the request-scoped DO host is evicted. #1338 exacerbates it (DOs idle/hibernate harder) but didn't cause it — the fire-and-forget push predates it. Only the host can hold the isolate alive past the method return, and auto-blocking _every_ commit would re-introduce the exact DO residency #1338 removed — so the fix is scoped to the **server-ingest path only** (the browser/app commit path is untouched). **No** client timer-park, **no** reverse-RPC rewrite (those wedged the browser before).

**1. Durability barrier in the fork** — `Store.whenLeaderSynced({ timeoutMs })` (`vendor/livestore/.../store/store.ts`). Resolves once a just-committed event is durable on the backend; resolves `false` on timeout. It is **two-phase**, and that is the crux:

- `commit()` only **synchronously** populates the **session** pending queue (it runs via `Runtime.runSync`). The session→leader hand-off is an **async batched fiber** (`ClientSessionSyncProcessor`'s `leaderPushQueue`). So checking the **leader** alone races: `leader.pending === 0` is true both _before_ the event has propagated to the leader **and** _after_ the backend confirms it — indistinguishable, and the early read reintroduces the exact strand.
- Therefore: **(a)** wait for `session.pending === 0` (the event has reached the leader — can't false-positive, since `commit` already put it in the session queue before returning), **then (b)** wait for `leader.pending === 0` (the leader has pushed it to the SyncBackend and been acked).
- Signal is `pending.length === 0`, **not** a head compare. `commit()` returns `void` (no seqNum handle) and a `localHead` snapshot is **not rebase-safe**: livePull + rebase move `localHead`/`upstreamHead` independently, so `upstreamHead >= snapshot` can be satisfied by _other_ clients' events while ours is still pending. `pending === 0` is unambiguous. (⚠️ `store.syncStatus()` is the wrong signal — it's session↔leader, reports `isSynced` while the event is still stranded before the backend.)
- Event-driven (subscribes to the `syncState.changes` streams; no polling — a pending timer is what disqualifies a DO from hibernation).

**2. Await it in `ingestAndProcess`** — when `result.status === "ingested"`, `await store.whenLeaderSynced(...)` before returning (`durable-object.ts`). The queue handler awaits the RPC, so it doesn't `ack()` until the event is on the backend → the link appears immediately and survives eviction. **This is what makes the e2e test green.** On timeout it logs and returns anyway — identical to the pre-fix self-heal-on-next-ingest, so the rare tail is no worse than before.

**3. `ctx.waitUntil` the processing pipeline** — the subscription's `runEffect(...)` (the AI pipeline, `durable-object.ts`) is wrapped in `this.ctx.waitUntil(processing.then(() => store.whenLeaderSynced(...)))`, so processing **and its pushes** complete before eviction (the summary lands without a second ingest). Falls back to fire-and-forget when there's no active request context to extend (e.g. livePull-triggered). This is the **"Hazard C"** hardening (see [[../architecture/sync-backend-do-hibernation-billing]] §TEMPORARY).

**Fork note (corrects an earlier draft):** this **does** touch the fork — the leader-reactive stream is not on the public Store surface, so a pure app-side, timer-free barrier wasn't possible. `whenLeaderSynced` is additive and upstreamable (the ergonomic `whenSynced()` barrier the livestore team mentioned). Because `tsgo` resolves `@livestore/livestore` from the **published** types, a one-interface module augmentation in `src/ambient.d.ts` declares the method for typecheck (local == prod).

**Not done (follow-up):** the secondary `storeId:""` 400 race (see below) — left out to keep this change precise.

**Validate on-device (pending):** cold Telegram ingest after >2 min idle → link appears in the UI **without** a second ingest, and its summary completes.

## Revisit after the livestore bump

The plan is to bump the vendored livestore to the latest upstream and re-check whether this strand still reproduces **before** re-doing any fix.

**Do NOT assume the bump fixes it.** The DO-hibernation PRs that landed upstream ([#1541](https://github.com/livestorejs/livestore/pull/1541) / [#1542](https://github.com/livestorejs/livestore/pull/1542) / [#1545](https://github.com/livestorejs/livestore/pull/1545)) harden the **pull** direction — live updates _backend → client_ surviving DO reconstruction. This strand is the **push** direction — an outbound send _client → backend_ orphaned on eviction. None of the merged work touches that path, so the bug may well persist.

**How to re-check:** un-skip the `describe.skip`ped cases in the e2e test, re-add a hermetic AI stub (so the pipeline case runs offline/fast), and run the suite against the bumped livestore. If the durability assertions pass **without** re-applying `whenLeaderSynced`, the bump fixed it → close this. If they fail, re-apply the suggested fix above (or its `waitUntil` / commit-receipt successor). Upstream's own intended shape is **commit-receipt awaitables** — issue [#722](https://github.com/livestorejs/livestore/issues/722) (supersedes #285), unstarted as of this writing.

## Reproduction & tests

**`src/cf-worker/__tests__/e2e/server-ingest-stranding.test.ts`** — e2e cases against the real LinkProcessorDO (`@cloudflare/vitest-pool-workers`), no mocks.

> **Current state (fix deferred):** the eviction-lever test **runs and passes**; the three durability groups are **`describe.skip`ped**. The durability check evolved from the `leader.upstreamHead` probe described below to reading the **SyncBackend's own `getEventlogMax()` from a fresh stub** (source-of-truth, independent of the client DO's lifecycle), and now covers three cases: durability-on-return, full-pipeline (with a forced-eviction survival check), and two-ingest sequential.

Historically (with the fix applied) **both original cases passed** (was `1 passed | 1 failed` — TDD-red — before the barrier landed).

1. **Eviction lever (PASSES)** — `abortAllDurableObjects()` (from `cloudflare:test`) tears down the in-memory DO isolate without deleting persisted SQLite, proven by stamping a random `__incarnation` via `runInDurableObject`, aborting, and re-reading via a **fresh** stub (stubs created before the abort are poisoned): the value changes ⇒ the isolate — and any un-awaited fiber on it — is destroyed. This is exactly what kills the background push fiber in prod.
2. **The durability contract (was TDD-red → now PASSES)** — after `await ingestAndProcess(...)`, read the leader sync state from inside the DO via `runInDurableObject`. Asserts the committed event is durable on the backend when the method returns, i.e. `leader.upstreamHead.global > 0`. **Before the fix** it failed with `expected 0 to be greater than 0` (at return `upstreamHead.global === 0`; nothing acked, `leader.pending === 2` = `linkCreatedV2` + first processing event). **With the fix** `ingestAndProcess` awaits `whenLeaderSynced` before returning, so `upstreamHead.global > 0` holds. A `found` guard (`expect(found).toBe(true)`) runs first so the result can't be a silent "store not found". (`> 0` rather than a brittle `pending === 0`: the AI pipeline keeps committing follow-on events, but `upstreamHead` only needs to clear our committed event.)

**Correction (an earlier draft of this doc was wrong):** I claimed Miniflare "does not evict idle DOs" and that reproducing the strand needed a production test-seam. **False** — `abortAllDurableObjects()` + `runInDurableObject` are exactly the eviction/introspection levers, no seam required. What _is_ true: the full strand-via-abort end-to-end (cold ingest → `abortAllDurableObjects()` → assert backend still empty) **hangs** the test process, because the LinkProcessorDO's open livePull connection to the SyncBackendDO deadlocks the abort/pool-teardown. So the chosen repro doesn't need abort at all — the `leader.pending > 0` probe demonstrates the durability gap deterministically and the incarnation test proves the eviction lever separately. (Adversarially reviewed 2026-06-25: leader `pending` genuinely = "not yet acked by the backend", drains only on the backend echo; the tests are honest, not artifacts.)

## Relevant files / signals

- `src/cf-worker/link-processor/durable-object.ts` — `ingestAndProcess` (`:602`), the `void runEffect` processing (`:258`), `fetch`/`storeId` (`:564`), `ensureSubscribed`.
- `src/cf-worker/queue-handler.ts` — acks after the RPC returns (`:107`); retry→DLQ on throw only.
- Diagnostic log signature: `ingestAndProcess called` with **no matching `ingestAndProcess completed`**, and **no `[SyncBackend] Push received`** for that store/url until a later ingest.

## Related

- [[server-ingest-durability]] · [[link-processor-stuck-after-eviction]] · [[../architecture/sync-backend-do-hibernation-billing]] · [[admin-server-ahead-alert]]

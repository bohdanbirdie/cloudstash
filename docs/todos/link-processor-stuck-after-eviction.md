# LinkProcessorDO: self-heal after DO eviction

## Problem

When the LinkProcessorDO is evicted mid-AI-call (CPU limit, memory pressure, deploy, region migration — all routine on Cloudflare), the in-flight link processing is killed without an event being written. The `v1.LinkProcessingStarted` event was already materialized to `status = "pending"`, but no terminal event (`Completed`/`Failed`/`Cancelled`) ever lands.

A self-heal exists on `ensureSubscribed()` — the subscription on `pendingLinks$` (`link-processor/durable-object.ts:200-216`) picks up any link whose status is `"pending"` or `"reprocess-requested"` and reprocesses it.

**The gap:** `ensureSubscribed()` is only called from three entry points:

1. `fetch()` — invoked by `SyncBackendDO.triggerLinkProcessor` (`link-processor/durable-object.ts:526`)
2. `ingestAndProcess()` — when a new link arrives via the link queue (`:572`)
3. `syncUpdateRpc()` — when the SyncBackendDO notifies the DO of new events (`:614`)

None of these run on a schedule. The DO sleeps until something talks to it. And `SyncBackendDO.triggerLinkProcessor` is only invoked when a push contains `LinkCreated` / `v2.LinkCreated` / `LinkReprocessRequested` (`sync/index.ts:32-40`) — it does NOT wake the processor for any other event, and never on its own.

## Concrete failure scenario

1. User connects X, 50 bookmarks queue up
2. DO processes 45, gets evicted at #46
3. 5 links are left with `status = "pending"`, no terminal event
4. User closes laptop
5. Next morning: opens the app → SyncBackendDO wakes from the client websocket, but no new push events arrive → LinkProcessorDO stays cold → spinners forever in the inbox until the user incidentally saves a new link

This was reproduced on 2026-05-16. 5 stuck links from 2026-05-15 21:28:00–21:28:28 UTC stayed stuck until manual reprocess.

## Recovery options

| Option                                                                 | Effort            | When it triggers                                                                                             |
| ---------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| 1. LinkProcessor self-arming alarm                                     | small             | Auto-sweep every N min while any pending exist; halts when clean. Survives DO eviction since alarms persist. |
| 2. Wake LinkProcessor on client connect (in SyncBackendDO)             | trivial (~1 line) | When user opens the app — same trigger that woke SyncBackendDO                                               |
| 3. Client-side: detect stale "pending" → fire `LinkReprocessRequested` | medium            | Only helps users who look at the UI; can double-charge if real processing is just slow                       |

## Recommendation

Ship 1 AND 2 — they're complementary, not redundant:

- **(2)** is cheap and covers the "user opened the app" case, which is the most common path.
- **(1)** covers headless cases — Telegram bot ingestion, Raycast extension, mobile background sync, X-sync poll-driven enqueues. Anything that doesn't open a websocket. The alarm is armed only while pending count > 0 (data-driven, like the X-sync DO alarm pattern), so cost is bounded.

## Implementation sketch

**Option 2 — wake on connect (in `sync/index.ts`):**

Hook the SyncBackend constructor / onSync handler so the first time a client connects after the DO wakes, it pings `LINK_PROCESSOR_DO.idFromName(storeId).fetch(...)` — same call as `triggerLinkProcessor`. One-shot; LinkProcessor decides whether anything is pending.

**Option 1 — self-arming alarm in `link-processor/durable-object.ts`:**

- After every `processLinkEffect` finalization (success or fail), check `tables.linkProcessingStatus.where({ status: 'pending' })`.
- If `count > 0`: `ctx.storage.setAlarm(Date.now() + STUCK_SWEEP_INTERVAL_MS)`. Interval: probably 5–10 min.
- If `count === 0`: `ctx.storage.deleteAlarm()`.
- `override async alarm()`: call `ensureSubscribed()`. The subscription naturally re-picks-up `pending` links.

Watch-out: don't re-arm the alarm during the in-flight subscription run, or you'll churn. Only re-evaluate after the subscription's `forEach` settles.

## Not in scope

- **Stop writing `LinkProcessingStarted` until processing finishes**: would lose the "processing" UI state. Not a real option.
- **TTL on `pending` rows**: would need wall-clock comparison + a sweep job anyway, so it collapses into option 1.
- **Queue retry**: the link queue ACKs after `ingestAndProcess` returns "ingested" (fire-and-forget), so retry semantics don't help here.

## Relevant files

- `src/cf-worker/link-processor/durable-object.ts` — self-heal subscription + entry points
- `src/cf-worker/sync/index.ts` — `triggerLinkProcessor` + push event filter
- `src/livestore/schema.ts` — `LinkProcessingStarted` materializer (line ~880)

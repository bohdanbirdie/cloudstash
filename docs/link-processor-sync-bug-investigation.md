# LinkProcessorDO Sync Bug Investigation

**Date started:** 2026-04-04
**Last updated:** 2026-04-06
**Status:** Root cause identified — livestore's `createStreamingResponse` creates a `ReadableStream` without `type: "bytes"`, which CF DO RPC requires for cross-isolate serialization. This causes broken framing on the client, preventing the live pull subscription from ever activating. Fix: add `type: "bytes"` to the `ReadableStream` constructor in `do-rpc/server.js`.

## Symptom

Links sent via Telegram are processed successfully by the LinkProcessorDO (metadata fetched, AI summary generated, Telegram notified) but never appear in the browser UI. Last working sync was around April 1.

## Current State (2026-04-05)

Two separate issues prevent sync, both now confirmed:

1. **Race condition** (CONFIRMED, fix re-applied): No guard on `getStore()` allows concurrent `createStoreDoPromise` calls, corrupting the eventlog. Fix: `storeCreationPromise` singleton guard (originally PR #30, reverted in PR #33, now re-applied).

2. **RPC stream last-element drop** (CONFIRMED): The `@livestore/common-cf` DO-RPC server converts Effect Streams into `ReadableStream` objects using a fire-and-forget async pattern. In production Cloudflare, the RPC connection tears down before the last `controller.enqueue()` completes, dropping the final stream element. This causes every cold-boot pull to lose its last chunk (`pageInfo: NoMore`). Not size-dependent — reproduced with both 1918 events and 16 events. Does NOT reproduce on miniflare (in-process RPC).

**How these interact:** The race condition caused the first eventlog corruption → led to table drop attempts → revealed the RPC stream drop (every fresh pull stalls). The DO stays alive indefinitely because the pull fiber never receives the stream termination signal, keeping the V8 event loop alive. `syncUpdateRpc` callbacks are always silently dropped (`No mailbox found, mapSize=0`) because the mailbox is never registered (requires the `NoMore` chunk from `concatWithLastElement`). Push-only sync works until a browser client creates events the DO hasn't seen → `ServerAheadError` → deadlock.

**What has been tried and failed:**
- Returning promise from `ReadableStream.start()` (Attempts 8-9) — did NOT fix the drop
- Reverting to old livestore snapshot (Attempt bisect) — same failure, not a livestore code change
- Table drops (Attempts 1-4) — pull always stalls at the same point

**Current deployed state (PR #35 + PR #36):**
- Old livestore snapshot (`551e77c106`) — was used for bisecting, can be upgraded back
- Store creation guard (`storeCreationPromise`) — prevents concurrent store race
- `start()` return patch on `common-cf` — did not fix the issue but is harmless
- Diagnostic logging patches on `sync-cf`, `common`, `common-cf`
- Fake AI services stub (100ms) in `durable-object.ts`

---

## CONFIRMED Findings

### 1. Concurrent Store Creation Race

**Evidence:** Production logs show 2-3 "Creating store" entries per ingest cycle (different requestIds, same timestamp). Confirmed on 2026-04-04 (20:54 UTC — 3 concurrent stores) and 2026-04-05 (09:49 UTC — 3 concurrent stores after table drop).

**Mechanism:**

1. Queue handler calls `ingestAndProcess` → `getStore()` → `createStoreDoPromise` (awaits)
2. During await, Cloudflare's input gate allows other requests through
3. `SyncBackendDO.onPush` sends GET fetches to the same DO (triggered by events in the push batch matching `v2.LinkCreated`)
4. Each request sees `cachedStore === undefined` and starts its own `createStoreDoPromise`
5. Multiple stores boot concurrently on the same DO SQLite storage

**Note:** `onPush` fires even when the push is rejected with ServerAheadError — the callback sees the batch before validation. This means even failed pushes trigger `triggerLinkProcessor`, creating more concurrent requests.

**Fix:** PR #30 added `storeCreationPromise` guard. Reverted in PR #33 because the stable store's sync fibers prevented hibernation (the eventlog was already corrupted at that point).

### 2. Dropped SQL Transactions in CF Adapter

**Confirmed in code** (`make-sqlite-db.ts:257-292`):

```
CF DO SQLite rejects SQL-level transaction control and requires storage.transactionSync() instead.
The current adapter only detects and suppresses those SQL statements.
```

The adapter's safety comment says: _"A Durable Object is single-threaded, so no concurrent reader can observe the intermediate inconsistency."_ This assumption is violated by the race condition — two leader-thread instances DO interleave at `await` points.

### 3. ServerAheadError Is Normal (Not Fatal)

ServerAheadError is part of livestore's rebase protocol. When push is rejected:

1. Push fiber parks on `Effect.never` (LeaderSyncProcessor.ts:906-909)
2. Pull delivers missing events → `SyncState.merge` triggers rebase
3. Pending events are re-sequenced
4. Push fiber is interrupted and restarts with correct cursor

This works correctly when the pull CAN deliver events. It fails when the pull stalls or when the client's local eventlog has divergent events.

### 4. Rebase Protocol DOES Work (Partially)

During the 2026-04-05 table drop test, deployment logs showed the rebase climbing:

```
providedNum: 0 → 100 → 200 → 256 → 356 → ... → 1792 → 1892
```

All at timestamp `08:41:31.070` — the rebase ran in under a second. Each step: push fails → pull delivers batch → push retries with higher cursor. **But it stalled at 1892, 26 events short of 1918.**

### 5. Browser Sync Works Fine

User logged out, cleared OPFS, logged back in. Events sync correctly between browser clients. The SyncBackendDO is healthy. Problem is exclusively LinkProcessorDO → SyncBackendDO direction.

### 6. DO Never Hibernates When Stuck

Observability data confirms:

- wallTimeMs of 7-30 minutes per request (stuck sync fibers)
- `executeTransaction` RPCs from SyncBackendDO keep resetting eviction timer
- DO stays alive indefinitely (observed 53+ minutes continuously)
- `hadCachedStore: true` on subsequent requests — confirms no hibernation between requests

### 7. Local Eventlog Grows Unboundedly

Each boot adds ~8 events (local link processing). None ever sync:

- 20:06 — 2,079 rows
- 20:36 — 2,087 rows (+8)
- 20:54 — 2,095 rows (+8)
- After table drop + reboot — 1,895 rows (re-pulled + local processing)

### 8. SyncBackendDO Events at seqNums 1893-1918

Queried SyncBackendDO's eventlog in CF dashboard. Events at the stall boundary:

| seqNum | name                       | clientId          |
| ------ | -------------------------- | ----------------- |
| 1901   | v1.LinkMetadataFetched     | link-processor-do |
| 1902   | v1.LinkSummarized          | link-processor-do |
| 1903   | v1.TagSuggested            | link-processor-do |
| 1904   | v1.TagSuggested            | link-processor-do |
| 1905   | v1.LinkProcessingCompleted | link-processor-do |
| 1906   | v1.LinkSourceNotified      | link-processor-do |
| 1907   | v2.LinkCreated             | julax (browser)   |
| 1908+  | various                    | julax (browser)   |

Events 1901-1906 were pushed by the LinkProcessorDO BEFORE the corruption (the last working link, April 1). Events 1907-1918 are from the browser. ~~**It has NOT been confirmed whether these clientId="link-processor-do" events cause the pull to skip them.**~~ Confirmed: no filtering, all events emitted.

### 9. Server-Side Pull Completes, Client Receives Partial

**Evidence (2026-04-05 ~12:47 UTC):** After dropping LinkProcessorDO state and sending 1 Telegram link:
- SyncBackendDO pull emitted all 1918 events: 8 pages, 23 chunks, final chunk `batchSize=26, pageInfo=NoMore`, EOF at page 8
- LinkProcessorDO store created with only `totalRowsWritten: 281` — far below the expected ~4200+ for 1918 events
- First push: `ServerAheadError: minimumExpectedNum 1918, providedNum 0`
- No rebase climbing observed (previously saw 0→100→200→...→1892)
- `onPush` callback triggered ~20+ `triggerLinkProcessor` fetches (cascade)
- Old unprocessed links picked up by subscription (partial pull pulled `LinkCreated` but missed completion events)

**Conclusion:** The problem is NOT server-side. The server emits all events correctly. The RPC client/transport drops events between server emission and client application. This explains why miniflare works (different RPC transport) but production fails.

### 10. Last RPC Pull Chunk Dropped (CONFIRMED)

**Evidence (2026-04-05 ~13:13 UTC):** Client-side logging confirms:
- Client received chunks index 0-21 (22 chunks, 1892 events total)
- Client did NOT receive chunk index 22 (`batchSize=26, pageInfo=NoMore`)
- Server emitted all 23 chunks including index 22
- DO eventlog export confirms exactly 1892 pulled events (rebaseGen=0) + 8 local events (rebaseGen=1)
- `totalRowsWritten: 281` is the materializer view state, not eventlog rows
- Same stall point (1892) reproduced across Attempts 1, 3, and 4

**Root cause:** The DO-to-DO RPC transport drops the final stream-terminating chunk. See Theory D (now confirmed) for full analysis and fix options.

---

## UNCONFIRMED Theories

### Theory C: Eventlog corruption mechanism (concurrent stores)

**Status:** Code analysis only, not confirmed via live trace.

Two concurrent `createStoreDoPromise` calls → both pull from server → both try to insert events → dropped transactions + no ON CONFLICT → UNIQUE constraint violation → MaterializeError swallowed → eventlog inconsistency → divergence.

**Counter-argument:** Could not reproduce the actual race condition locally (miniflare serializes DO requests). 30+ concurrent ingest requests via the API all processed one at a time. Only the aftermath (diverged eventlog → ServerAheadError) was reproduced locally.

### Theory D: RPC transport drops the final stream-terminating chunk

**Status:** CONFIRMED (2026-04-05 ~13:13 UTC).

Server emits 23 chunks (index 0-22). Client receives 22 chunks (index 0-21). The final chunk — `index=22, batchSize=26, pageInfo=NoMore` — is **dropped by the DO-to-DO RPC transport**. This has been reproduced 3 times with identical results (Attempts 1, 3, 4).

**Evidence:**
- Server logs: `[pull] Chunk emitted, index=22, batchSize=26, pageInfo={"_tag":"NoMore"}`
- Client logs: last received is `[do-rpc-client] Pull chunk received, index=21, batchSize=100, pageInfo={"_tag":"MoreKnown","remaining":26}`
- No `index=22` on the client side
- DO eventlog confirms exactly 1892 events received (1918 - 26 = 1892)

**Root cause:** The `@livestore/common-cf` DO-RPC server (`do-rpc/server.ts:228-294`) converts an Effect Stream into a `ReadableStream`. The stream processing runs as a fire-and-forget async fiber inside `start(controller)`:

```
new ReadableStream({
  start(controller) {
    const runStream = Effect.gen(function* () {
      yield* Stream.runForEachChunk(stream, (chunk) => controller.enqueue(serialized))
      controller.enqueue(exitSerialized)  // <-- RACE: may not complete
      controller.close()
    })
    runStream.pipe(Effect.runPromise)  // Fire-and-forget, start() returns immediately
  },
})
```

The RPC method returns the `ReadableStream` before the async fiber finishes. In production Cloudflare, the runtime tears down the stream before the last `controller.enqueue()` completes.

**Confirmed: NOT size-dependent (2026-04-05 ~13:32 UTC).** A fresh account with only 16 events (1 pull chunk) also loses the `NoMore` chunk. The single chunk IS the stream-terminal chunk → client receives zero events → `ServerAheadError: minimumExpectedNum 16, providedNum 0`. **Every cold-boot pull is broken**, not just large ones.

**Why miniflare works:** Miniflare runs DO-to-DO RPC in-process (same V8 isolate). The stream context stays alive long enough for the async fiber to complete. Production uses cross-isolate RPC with more aggressive cleanup.

**Why this never happened before — Bug was always there. Push-only sync masked it.**

Deployed code from 9 days ago (commit `7b2be3b`) and 2 weeks ago (`46fffcb`) on clean accounts. Same behavior: `No mailbox found for 0` on every `syncUpdateRpc`. The DO-RPC live pull subscription has **never worked** in production.

The system survived because push-only sync was sufficient:
1. Telegram → LinkProcessorDO creates events locally → pushes to SyncBackendDO → SyncBackendDO broadcasts to browser WebSocket → browser sees events
2. DO never hibernates (pull fiber hangs on stream that never terminates) → cached store persists
3. As long as only LinkProcessorDO creates events (no browser-created events), push always succeeds
4. Browser WebSocket sync uses a completely different mechanism (`Stream.concat(Stream.never)` + direct WS write in `push.ts`) — no mailbox involved, always works
5. April 2: deployments forced cold boots + user started saving links via UI → exposed the divergence

**Root cause: Missing `type: "bytes"` on ReadableStream (confirmed via end-to-end trace, 2026-04-06)**

The `createStreamingResponse` function in `@livestore/common-cf/do-rpc/server.ts` (line 229) creates:
```js
new ReadableStream({ start(controller) { ... } })  // NO type: "bytes"
```

Per [Cloudflare RPC docs](https://developers.cloudflare.com/workers/runtime-apis/rpc/): **"Only byte-oriented streams (streams with an underlying byte source of `type: "bytes"`) are supported"** for DO-to-DO RPC.

Without `type: "bytes"`, the non-byte ReadableStream is not properly serialized across the CF DO RPC boundary. The data arrives at the client with broken framing — multiple `controller.enqueue()` calls are merged into fewer `reader.read()` responses. The msgPack `unpackMultiple` decodes `[[msg1], [msg2], ...]` but the client's unwrapping logic expects `[[message]]` (single), producing `message = [msg1]` (array not object) → `message._tag = undefined` → Effect RPC's `run` callback silently drops the message (hits `default` → `Effect.void`) → inner mailbox never receives data → stream never completes → `concatWithLastElement` never fires → mailbox never registered → `syncUpdateRpc` dropped → push-only sync until divergence → `ServerAheadError` → `Effect.never` → permanent deadlock.

**Why miniflare works:** In-process DO RPC passes the `ReadableStream` object directly without Cap'n Proto serialization, so the `type: "bytes"` requirement is not enforced. Each `enqueue()` maps 1:1 to a `reader.read()`.

**Evidence chain:**
- Attempt 11: Server enqueues 23 Chunk + 1 Exit + close. Client reads only 2-3 times, all `_tag=undefined`, never sees `done=true`.
- Old code (2+ weeks ago): Same `No mailbox found for 0` behavior.
- Full protocol trace: `_tag` IS the correct field. When undefined, Effect RPC silently drops → stream never terminates.
- CF docs explicitly require `type: "bytes"` for RPC-returned ReadableStreams.

**Fix:** Add `type: "bytes"` to the `ReadableStream` constructor in `do-rpc/server.js`. The existing code already enqueues `Uint8Array` (msgPack output), so the byte controller API is compatible.

**Code locations:**
- Bug: `@livestore/common-cf/src/do-rpc/server.ts:229` — `new ReadableStream({...})` missing `type: "bytes"`
- Client unwrapping: `@livestore/common-cf/src/do-rpc/client.ts:17-28` — fragile for merged buffers (secondary issue)
- Effect RPC silent drop: `@effect/rpc` `RpcClient.js` `run` callback `default` case returns `Effect.void`

---

## Denied Theories

### 1. PR #26 Caused the Bug

**Denied.** Materializer change doesn't affect eventlog PK conflict. `schemaHash` is from event schemas, not materializers.

### 2. Drop All DO State via Code Migration

**Denied by user.** Too blunt for production. What about 100k events? Not clear when regression happened.

### 3. MaterializeError During Boot Is the Blocker

**Denied.** Only observed during concurrent store creation. After race fix, no MaterializeError. Blocker is sync, not boot.

### 4. ServerAheadError Is Fatal

**Denied.** Part of rebase protocol. Issue is that rebase can't complete.

### 5. PR #25 (Defuddle) Caused the Bug

**Denied.** Content extraction unrelated to sync/eventlog.

### 6. `livePull: true` Prevents Hibernation

**Denied.** System worked fine for weeks with `livePull: true`. In healthy state, the pull fiber waits on I/O (mailbox) which Cloudflare CAN hibernate through. Only `Effect.never` (from stuck ServerAheadError) prevents hibernation.

### 7. Table Drop + Fresh Boot Fixes the Problem

**Denied.** Tried on 2026-04-05. Dropped all 3 tables (eventlog, \_\_livestore_sync_status, vfs_pages). Store booted fresh, pull started from 0, rebase climbed to 1892 but stalled. New events diverged again. Three concurrent stores created on reboot (race still active). Problem persists.

### 8. setTimeout for Hard DO Lifetime Limit

**Denied by user.** Not the right mechanism for DOs. Platform evicts after 70-140s of no requests, but `executeTransaction` RPCs keep resetting the timer.

### 9. resetPersistence in Code for Auto-Recovery

**Denied by user.** No clear trigger for when to reset. Don't want automated resets.

### 10. Server-Side Pull Streaming Bug (last sub-chunk dropped)

**Denied.** Production logging (2026-04-05 ~12:47 UTC) confirms server emits all 1918 events correctly, including the [100, 26] tail chunk from `splitChunkBySize` with `pageInfo: NoMore` and EOF. The `mapChunksEffect` / `unfoldChunkEffect` pipeline works as designed. Problem is downstream in the RPC transport.

### 11. Pull Stall Caused by clientId Echo Filtering

**Denied.** Production logging (2026-04-05 ~12:47 UTC) shows all 1918 events emitted by server pull with no clientId-based filtering. Events 1901-1906 (`clientId: "link-processor-do"`) were included in the pull stream normally.

---

## Recovery Attempts

### Attempt 1: Table drop (2026-04-05 ~10:41 UTC)

- Dropped all 3 tables via CF dashboard
- Store booted fresh: `existingEventlogRows: 0, maxSeqNumGlobal: 0`
- Pull started, rebase climbed from providedNum 0 → 1892
- Push at 1892: `ServerAheadError: minimumExpectedNum 1918, providedNum 0` (first push before rebase) then stalled at 1892
- `sync_status.head` stuck at 1892
- Three telegram links sent, all processed locally, none synced to UI
- `executeTransaction` RPCs kept DO alive for 53+ minutes
- **Failed:** pull stalled at 1892, never reached 1918

### Attempt 2: Redeploy (2026-04-05 ~11:47 UTC)

- Redeployed latest commit to force DO restart
- Deployment logs showed buffered ServerAheadErrors from old boot (providedNum climbing 0→1892)
- After deploy, sent telegram link — 3 concurrent "Creating store" entries (race active)
- `existingEventlogRows: 1895` (1892 pulled + 3 local from previous attempt)
- Head still at 1892
- **Failed:** same stall, plus race re-corrupted the eventlog

### Local Reproduction: Scale Test (2026-04-05 ~12:07-12:26 UTC)

**Goal:** Test whether the pull stall is related to eventlog size by reproducing locally with miniflare.

**Setup:**

- Sent 300 links via `/api/ingest` with API key auth (source: "api")
- AI summary stubbed at 100ms (fake services in `durable-object.ts`)
- All 300 links fully processed and synced to browser UI

**Drop test 1 (~12:22 UTC) — ~10k eventlog rows:**

- Deleted LinkProcessorDO sqlite file, kept SyncBackendDO intact
- Sent 1 link to trigger fresh boot
- `existingEventlogRows: 0` → store created in ~1.2s
- `totalRowsWritten: 10130` — full eventlog pulled successfully
- Link processed and synced to UI immediately
- **No stall**

**Drop test 2 (~12:26 UTC) — ~21k eventlog rows:**

- Sent 60 more links (total ~360 links processed), repeated drop
- `existingEventlogRows: 0` → store created in ~2.1s
- `totalRowsWritten: 21443` — full eventlog pulled successfully
- Link processed and synced to UI immediately
- **No stall**

**Conclusion:** Pull stall is NOT reproducible locally with miniflare, even at event counts 10x above production's 1918. The issue is specific to production Cloudflare's DO-to-DO RPC transport.

**Note:** miniflare runs DO-to-DO RPC in-process (same V8 isolate). Production uses actual RPC between separate isolates, with different buffering/backpressure characteristics.

### Attempt 3: Production table drop with pull logging (2026-04-05 ~12:47 UTC)

- Dropped LinkProcessorDO state (eventlog head was 1892, highestSeqNum 1911, 69 vfs_pages rows)
- Also cleared browser OPFS for clean browser pull
- Deployed with server-side pull logging (sync-storage, pull.ts, transport-chunking patches)
- **Browser pull:** All 1918 events received successfully (23 chunks, EOF at page 8)
- **LinkProcessorDO pull:** Server emitted all 1918 events (confirmed by logs), BUT:
  - Store created with only `totalRowsWritten: 281` — client received a fraction
  - Push immediately failed: `ServerAheadError: minimumExpectedNum 1918, providedNum 0`
  - No rebase climbing (unlike Attempt 1 which climbed to 1892)
  - ~20+ `triggerLinkProcessor` fetch cascade from `onPush` callback
  - Old unprocessed links picked up by subscription (partial pull got `LinkCreated` but missed completion events)
  - 2 old links reprocessed (1 with real AI summary from pre-stub, 1 with fake summary)
- **Key finding:** Server-side pull is NOT the problem. All events emitted correctly. Issue is RPC client-side — events lost in transport between SyncBackendDO and LinkProcessorDO.
- **Failed:** same sync deadlock, but now we know the root cause layer

### Attempt 4: Production table drop with client-side pull logging (2026-04-05 ~13:13 UTC)

- Dropped LinkProcessorDO state again, sent 1 Telegram link
- Server emitted all 23 chunks (confirmed by server-side logs)
- **Client received only 22 chunks** (index 0-21), missing chunk 22 (`batchSize=26, pageInfo=NoMore`)
- Client eventlog: 1892 pulled events + 8 local = 1900 total (confirmed by SQL export)
- Same `ServerAheadError: providedNum 0`, same cascade, same 2 old links reprocessed
- **CONFIRMED:** RPC transport drops the final stream-terminating chunk

### Attempt 5: Local test with production data (2026-04-05 ~13:25 UTC)

- Exported production SyncBackendDO eventlog (1918 events) via SQL
- Imported into local miniflare SyncBackendDO (table name remapped to local storeId)
- Dropped local LinkProcessorDO state
- Sent 1 link via API
- **Client received all 23 chunks** including `index=22, batchSize=26, pageInfo=NoMore`
- `totalRowsWritten: 9143` — full 1918 events materialized
- Links processed and synced successfully, no ServerAheadError
- **Conclusion:** The production data is NOT the problem. The exact same events pull correctly on miniflare. The bug is exclusively in the production Cloudflare DO-to-DO RPC transport.

### Attempt 6: Fresh account reproduction (2026-04-05 ~13:32 UTC)

- Logged in with a different account that had 0 links
- Sent 2 links via Telegram — both appeared in UI (DO was warm, processed normally)
- DO hibernated
- Sent 3rd link — **did NOT appear in UI**
  - DO woke fresh: `existingEventlogRows: 16, hadCachedStore: false`
  - Server pull: `total=16`, single chunk `batchSize=16, pageInfo=NoMore`
  - **No `[do-rpc-client] Pull chunk received` log** — client received zero chunks
  - Push: `ServerAheadError: minimumExpectedNum 16, providedNum 0`
  - Race condition also active: TWO concurrent "Creating store" entries (different debugInstanceIds)
- Sent 4th link — also did not appear
  - `totalRowsWritten: 40` on boot (only local events materialized, no server events)
  - head stuck at 0 in `__livestore_sync_status`, 28 `vfs_pages` rows
- **Conclusion:** Bug is NOT size-dependent. A single-page pull (16 events, 1 chunk) also drops the `NoMore` chunk. Every cold-boot pull is broken in production.

### Attempt 7: Fresh account full lifecycle (2026-04-05 ~15:01-15:16 UTC)

- Dropped BOTH SyncBackendDO and LinkProcessorDO for the fresh account (clean slate)
- Sent link 1 via Telegram → appeared in UI (0 events to pull, store booted fine)
- Waited 4+ min → sent link 2 → **appeared in UI**, `hadCachedStore: true`, same `debugInstanceId` as link 1
- DO **never hibernated** despite 4 min gap — sync fibers keep V8 event loop alive
- `[do-rpc-client] No mailbox found for requestId=0, mapSize=0` on every `syncUpdateRpc` — mailbox was never registered
- Sent links 3-5 → all appeared in UI, all `hadCachedStore: true`, same instance
- **Then:** Saved 2 links via browser UI (not Telegram) → `v2.LinkCreated` pushed to SyncBackendDO → `syncUpdateRpc` callbacks arrived at LinkProcessorDO → `No mailbox found` → silently dropped
- Links from UI were NOT processed by LinkProcessorDO (subscription didn't fire for them)
- Sent another Telegram link → processed locally but push failed: `ServerAheadError: minimumExpectedNum 58, providedNum 56` (2 browser events missing from DO's eventlog)
- Browser refresh: `[sync-storage] getEventsDoSqlite total=0, cursor=58` — SyncBackendDO has 0 events after cursor 58, meaning browser is up to date but LinkProcessorDO's events after seq 56 never synced

**Key findings:**
1. DO never hibernates — even with 0 events to pull, `concatWithLastElement` never fires (NoMore chunk dropped), pull fiber hangs
2. Push-only sync works: LinkProcessorDO creates events locally and pushes → server accepts (DO is ahead)
3. Pull is completely broken: `syncUpdateRpc` callbacks are always dropped (no mailbox)
4. System breaks the moment another client (browser) creates events the DO hasn't seen
5. This explains why the system "worked" for weeks: only Telegram links were being saved, no browser-created links between DO boots

### Attempt 8: Test `start()` return fix on fresh account (2026-04-05 ~15:38 UTC)

- Deployed patch: returning `Effect.runPromise()` promise from `ReadableStream.start()`
- Fresh account (DOs dropped by deployment), sent 1 Telegram link → appeared in UI
- `existingEventlogRows: 0` → 0-event pull, no chunks to deliver
- `No mailbox found, mapSize=0` on `syncUpdateRpc` — mailbox still not registered
- Saved 1 link via browser UI → `syncUpdateRpc` dropped → LinkProcessorDO missed it
- Sent another Telegram link → `ServerAheadError: minimumExpectedNum 9, providedNum 8` (1 browser event missing)
- **Fix did NOT help for 0-event pulls** — the `emitIfEmpty` NoMore chunk is still dropped or never reaches the client

### Attempt 9: Test `start()` return fix on main account (2026-04-05 ~15:46 UTC)

- Dropped LinkProcessorDO for main account (1918 events on SyncBackendDO)
- Server emitted all 23 chunks including `index=22, batchSize=26, pageInfo=NoMore`
- Client received chunks 0-21 (22 chunks), **chunk 22 still missing**
- Same `ServerAheadError: minimumExpectedNum 1918, providedNum 0`
- Same cascade of `triggerLinkProcessor` fetches, same 2 old links reprocessed
- **Fix did NOT work.** Returning the promise from `start()` does not prevent the last chunk from being dropped. The issue is not about `start()` completing — the stream IS producing chunks (22 arrive) — the problem is specifically the last `controller.enqueue()` before `controller.close()`.

**Revised understanding:** The race is not between `start()` returning and the stream closing. The race is between the last `enqueue()` and `close()` — the RPC transport may see `close()` and stop reading before the last enqueue's data is flushed. Or the Exit message enqueued after the last chunk interferes with chunk delivery.

### Attempt 11: Transport-level logging (2026-04-06 ~23:13 UTC, PR #38)

**Server side:** All 23 data chunks enqueued (`enqueue Chunk, valuesCount=1` × 23), `stream forEach complete`, `enqueue Exit`, `controller.close() called`. Server-side is fully complete.

**Client side — CRITICAL FINDING:**
- Only 2-3 `reader.read()` calls produced data — NOT 23 separate reads. CF DO RPC batches/merges `controller.enqueue()` calls into fewer reads.
- All decoded messages have `_tag=undefined` — the Chunk/Exit wrappers are lost during serialization.
- ~180+ messages extracted from read #2 alone — individual values are being unpacked without their wrappers.
- **No `reader.read() done=true` ever logged** — the client never sees the stream end.

**Revised root cause:** This is NOT a "last chunk dropped" problem. It's a **serialization framing issue**. The server encodes each chunk as `parser.encode([{_tag: 'Chunk', requestId, values}])` — individual msgPack-encoded buffers. But the CF DO RPC layer merges these buffers before delivering them to the client's `reader.read()`. The client then calls `parser.decode()` on the merged buffer, which produces a flat array without the Chunk/Exit wrapper structure. Without seeing `_tag: 'Exit'`, the Effect RPC protocol never knows the stream is finished → client hangs forever.

**Key implication:** The data IS being delivered to the client — but the framing is broken. Miniflare delivers each `enqueue()` as a separate `reader.read()` response (preserving 1:1 framing). Production CF DO RPC merges them, breaking the msgPack message boundaries. This is likely a CF platform behavior change.

### Attempt 10: Restore latest snapshot + update compat date (2026-04-05 ~18:07 UTC, PR #37)

- Restored livestore to latest snapshot (`6f52faf`)
- Updated `compatibility_date` to `2026-04-05`
- Removed the `common-cf` `start()` return patch (confirmed unhelpful)
- Kept diagnostic logging patches on `sync-cf` and `common`
- Deployed and tested — **same failure**. Updating compat date did not change the behavior.

---

## DO Lifecycle Facts (From Cloudflare Docs)

- **No forced shutdown mechanism** — no `ctx.abort()`, no kill switch
- **Non-hibernatable DOs evicted after 70-140s** of no new requests
- **`Effect.never`** = unresolved promise → blocks hibernation
- **`executeTransaction` RPCs** reset eviction timer → DO never reaches idle threshold
- **`blockConcurrencyWhile()`** has 30s hard timeout, blocks all concurrent requests
- **`resetPersistence: true`** in `createStoreDoPromise` — livestore's cleanup API (deletes eventlog + sync_status + vfs_pages), used in integration tests

---

## Key Livestore Internals

### Event Materialization

- `MaterializeError` wraps SQLite/schema errors during materialization
- With `onSyncError: 'ignore'`, errors are silently swallowed, batch transaction rolls back
- Boot rematerialization uses `skipEventlog: true`

### CF Adapter Sync Transport

- DO-to-DO uses RPC, not WebSocket
- `livePull` via callback: SyncBackendDO registers client in `rpcSubscriptions`, calls `syncUpdateRpc` and `executeTransaction` on client
- `requestIdMailboxMap` is module-level — lost on isolate restart

### Store Lifecycle in DOs

- `createStoreDoPromise` assumes exclusive SQLite access
- Background fibers (push, pull, local apply) are Effect fibers forked during boot
- Push fiber: infinite loop, waits for queue items, pushes to server
- Pull fiber: pagination from server, then livePull mailbox wait
- Neither fiber has a natural termination condition with `livePull: true`

### Push/Pull Constants

- `DO_PAGE_SIZE = 256` (events per SQLite query in pull)
- `MAX_PULL_EVENTS_PER_MESSAGE = 100` (events per RPC message)
- Push batch size: 50 events

---

## Local Reproduction

### Diverged eventlog reproduction (WORKS)

1. Start dev server, save a few links normally
2. Call `curl 'http://localhost:3000/api/debug/corrupt-eventlog?storeId=YOUR_ORG_ID'`
3. Restart dev server (simulates hibernation)
4. Send telegram link → ServerAheadError, link doesn't sync to UI

### Race condition reproduction (DOES NOT WORK)

Miniflare serializes DO requests. 30+ concurrent ingest requests all processed one at a time. Cannot trigger concurrent `createStoreDoPromise` locally. The race only happens in production Cloudflare where the input gate allows request interleaving at `await` points.

### Debug endpoints (TEMPORARY — in working tree, not deployed)

- `GET /api/debug/corrupt-eventlog?storeId=...` — injects fake events into LinkProcessorDO's eventlog
- Fake AI services in `durable-object.ts` (for faster local testing)
- Code in `src/cf-worker/link-processor/durable-object.ts` and `src/cf-worker/index.ts`

---

## TODO

- [ ] Investigate: after dev server crash/restart, ~40 unprocessed links (status: processing-started pre-crash) are not picked up by `pendingLinks$` subscription. Likely the query excludes links already marked as started. Need a recovery mechanism for links stuck in "started" state after DO restart.

---

## Open Questions

1. **Does `type: "bytes"` fix the issue?** Patch applied (PR pending). If it fixes the framing, the live pull subscription should activate, the mailbox should register, and `syncUpdateRpc` events should be delivered. This would fix both cold-boot pulls and the DO hibernation issue (pull fiber would complete normally).

2. **Report to livestore:** The missing `type: "bytes"` is a bug in `@livestore/common-cf/do-rpc/server.ts`. Should be reported regardless of whether the fix works. The CF docs explicitly require byte-oriented streams for RPC.

---

## Next Steps

1. ~~**Bisect the snapshot:**~~ DONE. Old snapshot also fails. Not a livestore change.
2. ~~**Return promise from `start()`:**~~ DONE. Did NOT fix the issue (Attempts 8-9).
3. ~~**Transport-level logging:**~~ DONE. Revealed `_tag=undefined` and merged buffers (Attempt 11).
4. ~~**Old code test:**~~ DONE. Same bug in code from 2+ weeks ago. Always broken.
5. **Test `type: "bytes"` fix:** Deploy and test. If it works, the live pull subscription should activate and the mailbox should be registered. Look for `[do-rpc-client-transport] read #N, message._tag=Chunk` (instead of `undefined`) and `Mailbox registered`.
6. **Report to livestore:** File issue with findings. Missing `type: "bytes"` on `ReadableStream` in `createStreamingResponse`.
7. **Clean up temporary code:** Remove fake AI stub, diagnostic logging patches, debug endpoints after fix is confirmed.

---

## Diagnostic Logging (Currently Deployed)

### DO-level (durable-object.ts, PR #31)

- `existingEventlogRows` and `maxSeqNumGlobal` on store creation
- `hadCachedStore` and `hadSubscription` on all entry points
- `Store created successfully` / `getStore: store creation failed`

### Livestore patches (do-rpc-client.js, pull.js, sync-storage.js, transport-chunking.js)

- `[do-rpc-client] Mailbox registered` — requestId, mapSize
- `[do-rpc-client] Push called` — batchSize, firstSeqNum, lastSeqNum
- `[do-rpc-client] Pull chunk received` — index, batchSize, pageInfo (client-side pull reception)
- `[do-rpc-client] No mailbox found / Mailbox found` — delivery status
- `[pull] Starting pull stream` — total, cursor (server-side)
- `[pull] Chunk emitted` — index, batchSize, pageInfo (server-side)
- `[sync-storage] getEventsDoSqlite` — total, cursor
- `[sync-storage] fetchPage` — page, cursor, rows, firstSeqNum, lastSeqNum
- `[transport-chunking] splitChunkBySize` — input items, output sub-chunks, sizes

---

## Files

- `src/cf-worker/link-processor/durable-object.ts` — LinkProcessorDO (race guard re-applied, diagnostic logging deployed)
- `src/cf-worker/sync/index.ts` — SyncBackendDO with `onPush` → `triggerLinkProcessor`
- `local/livestore/packages/@livestore/sync-cf/src/cf-worker/do/pull.ts` — server-side pull stream pipeline
- `local/livestore/packages/@livestore/common/src/sync/transport-chunking.ts` — splitChunkBySize
- `local/livestore/packages/@livestore/sync-cf/src/cf-worker/do/sync-storage.ts` — unfoldChunkEffect pagination
- `local/livestore/packages/@livestore/adapter-cloudflare/src/make-sqlite-db.ts` — dropped transactions
- `local/livestore/packages/@livestore/common/src/leader-thread/LeaderSyncProcessor.ts` — push/pull fibers, ServerAheadError, Effect.never
- `local/livestore/packages/@livestore/common/src/leader-thread/eventlog.ts` — insertIntoEventlog (no ON CONFLICT)
- `patches/@livestore%2Fsync-cf@0.0.0-snapshot-551e77c106...patch` — diagnostic logging (server pull, client pull, push)
- `patches/@livestore%2Fcommon@0.0.0-snapshot-551e77c106...patch` — transport-chunking logging
- `patches/@livestore%2Fcommon-cf@0.0.0-snapshot-551e77c106...patch` — `start()` return fix (did not fix the issue but harmless)
- `local/livestore/packages/@livestore/common-cf/src/do-rpc/server.ts` — fire-and-forget ReadableStream (root cause of stream drop)
- `local/livestore/packages/@livestore/common-cf/src/do-rpc/client.ts` — stream consumer

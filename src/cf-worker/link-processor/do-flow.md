# LinkProcessorDO - Implementation Complete

## Status: IMPLEMENTED AND TESTED

Implementation completed on 2026-01-22. All manual tests passed.

### Test Results

| Test                                      | Result                                            |
| ----------------------------------------- | ------------------------------------------------- |
| Single link processing                    | Passed - AI summary committed, client received it |
| Link after hibernation (few minutes wait) | Passed - DO woke up and processed                 |
| Two rapid links                           | Passed - Both processed without duplicates        |

---

## Mental Model

**"I am a worker that processes pending links. I wake up when poked, but I don't trust the poker. I look at the world (state) and decide what to do."**

The trigger (`onPush`) is just an alarm clock. The DO figures out what to do by examining state. This makes it resilient to:

- Race conditions (trigger fires before event persisted)
- Missed triggers (DO was hibernated)
- Duplicate triggers (multiple rapid link creations)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         TRIGGER                                  │
│                                                                  │
│   onPush detects v1.LinkCreated → fetch to LinkProcessorDO      │
│   (Just wakes up the DO - doesn't pass any data)                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     LinkProcessorDO                              │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    INITIALIZATION                        │   │
│   │                                                          │   │
│   │   1. Get or create cached store (livePull: true)        │   │
│   │      - Restores from persisted state                    │   │
│   │      - Syncs with SyncBackendDO (blocks up to 500ms)    │   │
│   │      - Continues syncing in background if needed        │   │
│   │                                                          │   │
│   │   2. Set up subscription to pendingLinks$ query         │   │
│   │      - Computed query filters for unprocessed links     │   │
│   │      - Fires immediately with current state             │   │
│   │      - Fires again whenever state changes               │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                 REACTIVE PROCESSING                      │   │
│   │                                                          │   │
│   │   Subscription callback fires with pending links:       │   │
│   │                                                          │   │
│   │   for each link:                                        │   │
│   │     - Skip if already processing (in-memory lock)       │   │
│   │     - Commit "pending" status                           │   │
│   │     - Fetch URL metadata                                │   │
│   │     - Generate AI summary                               │   │
│   │     - Commit "completed" or "failed" status             │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    STAY REACTIVE                         │   │
│   │                                                          │   │
│   │   - Store stays cached (never shutdown)                 │   │
│   │   - Subscription stays active                           │   │
│   │   - DO can hibernate between events                     │   │
│   │   - syncUpdateRpc wakes DO and delivers new events      │   │
│   │   - Subscription fires again → process new links        │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## DO Instance Model

**One LinkProcessorDO per organization, not per user.**

The DO ID is derived from `storeId`, which equals the organization ID:

```typescript
// In sync/index.ts - trigger creates DO from storeId
const processorId = env.LINK_PROCESSOR_DO.idFromName(storeId);
const processor = env.LINK_PROCESSOR_DO.get(processorId);

// storeId === orgId (from JWT claims)
if (claims.orgId !== context.storeId) {
  throw new Error("Access denied: not a member of this organization");
}
```

This means:

- All users in the same organization share one `LinkProcessorDO` instance
- Each organization has its own isolated processor
- The processor only sees events for its organization's store

## Persistence & Delta Sync

**The DO persists state locally and only fetches missing events on wakeup.**

### How it works:

1. **Local SQLite Storage**: The LiveStore adapter (`createStoreDoPromise`) automatically persists all events to SQLite in the DO's durable storage. This happens transparently.

2. **Session ID Tracking**: The `sessionId` is persisted and tracks sync progress with the SyncBackendDO:

   ```typescript
   private async getSessionId(): Promise<string> {
     const stored = await this.ctx.storage.get<string>('sessionId')
     if (stored) return stored  // Reuse existing session
     // Only create new if none exists
   }
   ```

3. **Delta Sync on Wakeup**: When the store is created after hibernation:
   - Restores immediately from persisted local SQLite (instant, no network)
   - Requests only **missing events** from SyncBackendDO since last sync
   - Blocks up to ~500ms for initial sync, continues in background if longer

### Why this matters:

| Scenario            | Without persistence    | With persistence              |
| ------------------- | ---------------------- | ----------------------------- |
| First wakeup        | Fetch all events       | Fetch all events              |
| Subsequent wakeups  | Fetch all events again | Fetch only new events (delta) |
| Large event history | Slow, expensive        | Fast, efficient               |

The `sessionId` must be persisted (not regenerated) to enable delta sync. If you generate a new sessionId on each wakeup, the SyncBackendDO won't know what events you already have.

## Key Principles

### 1. Don't Shut Down the Store

Cache the store instance. All LiveStore examples do this. Shutting down loses the sync connection and requires full re-sync on next wakeup.

### 2. Use `livePull: true`

Enables reactive sync updates via DO RPC callbacks. The DO can still hibernate - `livePull` doesn't keep it running forever.

### 3. Use Computed Query for Filtering

Let the reactive system filter for pending links using `queryDb` wrapper:

```typescript
const links$ = queryDb(tables.links.where({ deletedAt: null }));
const statuses$ = queryDb(tables.linkProcessingStatus.where({}));

const pendingLinks$ = computed(
  (get) => {
    const links = get(links$);
    const statuses = get(statuses$);
    const statusMap = new Map(statuses.map((s) => [s.linkId, s]));

    return links.filter((link) => {
      const status = statusMap.get(link.id);
      return !status || status.status === "pending";
    });
  },
  { label: "pendingLinks" }
);
```

Subscription callback only receives links that actually need processing.

### 4. In-Memory Processing Lock

Prevent duplicate processing when subscription fires multiple times during async work:

```typescript
private currentlyProcessing = new Set<string>()
```

This is lost on hibernation, but that's fine - the DB status persists.

### 5. Idempotent Processing

The processing status table is the source of truth. A link needs processing if:

- It has no status record, OR
- Its status is still "pending" (processing started but not finished)

## How It Handles Edge Cases

| Scenario                                            | What Happens                                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Race condition** (trigger before event persisted) | Subscription fires with no pending links. When sync completes, fires again with the new link.                     |
| **Missed triggers** (DO hibernated)                 | On wakeup, subscription fires immediately with ALL pending links from state.                                      |
| **Multiple rapid link creations**                   | Subscription fires with all pending links. Each is processed once (lock prevents duplicates).                     |
| **Processing takes long time**                      | Lock prevents re-processing. Other links can still be processed in parallel.                                      |
| **DO hibernates mid-processing**                    | Lock is lost, but "pending" status persists in DB. Link stays in pending query, will be picked up on next wakeup. |
| **Sync still in progress**                          | Subscription fires with partial state, then fires again as more data syncs.                                       |

## Summary

| Aspect               | Decision                                                  |
| -------------------- | --------------------------------------------------------- |
| Store lifecycle      | Cache forever, never shutdown                             |
| Sync mode            | `livePull: true`                                          |
| Data discovery       | Computed query `pendingLinks$` with `queryDb` wrapper     |
| Processing trigger   | Subscription callback (reactive)                          |
| Duplicate prevention | In-memory `Set` + DB status                               |
| Processing logic     | Reuses existing `processLink` Effect from process-link.ts |

## Files Modified

| File                                             | Changes                                     |
| ------------------------------------------------ | ------------------------------------------- |
| `src/cf-worker/link-processor/durable-object.ts` | Complete rewrite with reactive pattern      |
| `src/cf-worker/sync/index.ts`                    | No changes needed (already correct)         |
| `src/livestore/schema.ts`                        | No changes needed (schema already complete) |

## Implementation Notes

### Schema Events (already existed)

The schema uses three separate events instead of a single `linkProcessingStatusSet`:

- `linkProcessingStarted` - commits status='pending'
- `linkProcessingCompleted` - commits status='completed'
- `linkProcessingFailed` - commits status='failed' with error

### Processing Logic

The DO delegates to the existing `processLink` Effect function which handles:

1. Committing `linkProcessingStarted` for new links
2. Fetching metadata via `fetchOgMetadata`
3. Extracting content via `fetchAndExtractContent`
4. Generating AI summary via `generateSummary`
5. Committing `linkMetadataFetched` and `linkSummarized` events
6. Committing `linkProcessingCompleted` or `linkProcessingFailed`

### Type Inference

Use `typeof tables.links.Type` to infer row types from LiveStore tables.

---

## Implementation Tasks (Completed)

### Pre-Implementation

- [x] **Task 0:** Read and understand the current `durable-object.ts` implementation
- [x] **Task 1:** Read and understand the current `sync/index.ts` trigger implementation
- [x] **Task 2:** Verify `linkProcessingStatus` table and events exist in schema

### Schema

- [x] **Task 3:** Schema already complete - `linkProcessingStatus` table exists
- [x] **Task 4:** Schema already complete - events exist (`linkProcessingStarted`, `linkProcessingCompleted`, `linkProcessingFailed`)

### LinkProcessorDO Implementation

- [x] **Task 5:** Rewrite `durable-object.ts` with new structure
- [x] **Task 6:** Implement subscription setup with `queryDb` and `computed`
- [x] **Task 7:** Implement processing logic integrating with existing `processLink`
- [x] **Task 8:** Entry points (completed in Task 5)

### Trigger

- [x] **Task 9:** No changes needed - trigger already simplified

### Testing

- [x] **Task 10:** Single link processing - PASSED
- [x] **Task 11:** Multiple rapid links - PASSED
- [x] **Task 12:** After hibernation - PASSED

### Cleanup

- [x] **Task 13:** Old code removed during rewrite
- [x] **Task 14:** Types and imports updated

---

## Security

**LinkProcessorDO has no public HTTP access.**

### Access Paths

| Path                                   | Who can call      | Auth                  |
| -------------------------------------- | ----------------- | --------------------- |
| `SyncBackendDO.triggerLinkProcessor()` | Internal DO-to-DO | None needed (trusted) |
| `SyncBackendDO` → `syncUpdateRpc()`    | Internal DO RPC   | None needed (trusted) |

### How it's secured

1. **No HTTP route** - The `/api/link-processor` route was removed. The DO is not accessible via HTTP.

2. **DO-to-DO only** - Cloudflare DOs can only be accessed via:
   - A Worker that gets a stub (our worker doesn't expose this)
   - Another DO that gets a stub (only SyncBackendDO does this)

3. **External clients go through SyncBackendDO** - Browser clients connect via WebSocket to `handleSyncRequest()` which validates JWT auth before accepting connections.

4. **Org isolation** - Each org has its own `LinkProcessorDO` instance (ID from `storeId`/`orgId`). A processor can only see events for its own org.

### Auth flow for external clients

```
Browser → WebSocket → handleSyncRequest() → validatePayload(JWT) → SyncBackendDO
                                                                        ↓
                                                              LinkProcessorDO (internal)
```

---

## Warnings (Reference)

1. **Do NOT shut down the store** - This breaks the reactive model
2. **Do NOT use `livePull: false`** - We need reactive sync updates
3. **Do NOT query once and process** - Use subscription for reactivity
4. **Do NOT block in subscription callback** - Fire async, use lock for dedup
5. **Do NOT change the trigger to pass link data** - DO discovers work from state
6. **Do NOT add public HTTP routes to LinkProcessorDO** - Keep it internal only

---

## TL;DR

```
User creates link → SyncBackendDO.onPush → wake LinkProcessorDO via fetch

LinkProcessorDO:
  1. One instance per org (ID from storeId/orgId)
  2. Cached LiveStore with livePull:true (never shutdown)
  3. Persisted sessionId → delta sync only (not full refetch)
  4. Subscription to pendingLinks$ (computed query)
  5. Subscription fires → process each link async with in-memory lock
  6. processLink commits events → subscription sees change → loop

Key insight: DO doesn't trust trigger data. It queries state to find work.
This handles race conditions, missed triggers, and duplicates automatically.
```

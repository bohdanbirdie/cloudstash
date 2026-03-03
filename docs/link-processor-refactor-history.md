# LinkProcessorDO Refactor — Historical Investigation

Historical context, forensics, and options analysis from the LinkProcessorDO refactor. For the current architecture and implementation status, see [link-processor-refactor.md](./link-processor-refactor.md).

## Original Architecture + Problems

```
┌─────────────────────────────────────────────────────────────────────────┐
│ INGESTION (3 entry points)                                              │
│                                                                         │
│   Browser ──→ LiveStore sync ──→ SyncBackendDO.onPush()                │
│   Telegram ──→ POST /api/telegram ──→ LinkProcessorDO.handleIngest()   │
│   API ──→ POST /api/ingest ──→ LinkProcessorDO.handleIngest()          │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                          fire-and-forget fetch()
                          (no retry, no ack)
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ LinkProcessorDO                                                         │
│                                                                         │
│   ┌───────────────────────────────────────────────────────────────┐    │
│   │ LiveStore Client (full wasm SQLite + extensions)              │    │
│   │                                                               │    │
│   │   livePull ←── SyncBackendDO (replays ENTIRE eventlog)       │    │
│   │   ──→ rematerialize (rebuild all SQLite tables from events)  │    │
│   │   ──→ subscribe(pendingLinks$) — reactive query              │    │
│   │   ──→ store.commit(events) — push back via RPC               │    │
│   └───────────────────────────────────────────────────────────────┘    │
│                                                                         │
│   processNextPending() ── sequential chain:                             │
│     link₁ → fetchMetadata → extractContent → AI summary → commit       │
│     link₂ waits... (blocked if link₁ hangs)                            │
│     link₃ waits...                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

### What was wrong

```
                    ┌──────────────────────────────────────────────┐
                    │         TWO CATEGORIES OF PROBLEMS           │
                    ├──────────────────────────────────────────────┤
                    │                                              │
                    │  1. VFS WRITE AMPLIFICATION                  │
                    │     (production blocker, mitigated)          │
                    │                                              │
                    │     wasm SQLite ──→ CloudflareSqlVFS         │
                    │                      │                       │
                    │                      ▼                       │
                    │              INSERT INTO vfs_blocks          │
                    │              (64 KiB per block)              │
                    │                      │                       │
                    │                      ▼                       │
                    │          ~142 rows_written per commit        │
                    │          ~854 rows_written per link          │
                    │          114k rows_written on Feb 11         │
                    │          (99.9% of 100k/day free tier)       │
                    │                                              │
                    │     FIX: bun patch → in-memory DBs           │
                    │          (zero rows_written)                 │
                    │                                              │
                    ├──────────────────────────────────────────────┤
                    │                                              │
                    │  2. PROCESSING RELIABILITY                   │
                    │     (ongoing, unfixed)                       │
                    │                                              │
                    │     • Sequential chain: 1 stuck link         │
                    │       blocks ALL subsequent links            │
                    │     • No timeouts on fetch/AI calls          │
                    │     • No retry (fire-and-forget dispatch)    │
                    │     • Cold start grows linearly with         │
                    │       eventlog (full replay every wake-up)   │
                    │     • Race conditions in reprocess flow      │
                    │       (patched but fragile design)           │
                    │                                              │
                    └──────────────────────────────────────────────┘
```

## Phase 1: In-Memory Patch

Already applied and verified locally. Switches `dbState` and `dbEventlog` from persistent VFS to in-memory.

```
BEFORE:                                         AFTER:
wasm SQLite                                     wasm SQLite
    │                                               │
    ▼                                               ▼
CloudflareSqlVFS                                MemoryVFS
    │                                               │
    ▼                                               ▼
ctx.storage.sql                                 JS heap (ArrayBuffers)
INSERT INTO vfs_blocks                          lost on DO eviction
~142 rows_written per commit                    0 rows_written
                                                rebuilt from eventlog on wake-up
```

Events still push to SyncBackendDO via RPC (native SQLite, ~2 rows/event). Processing logic unchanged.

### Patch Details

Package: `@livestore/adapter-cloudflare@0.4.0-dev.22`
File: `make-adapter.ts` (and `dist/make-adapter.js`)

The patch switches `dbState` and `dbEventlog` from `_tag: 'storage'` (CloudflareSqlVFS, persists to native DO SqlStorage) to `_tag: 'in-memory'` (MemoryVFS, JS heap only).

**IMPORTANT:** Per project convention, patch **both** `src/*.ts` and `dist/*.js` — runtime imports from dist, not source. See existing patch `patches/@livestore%2Fsync-cf@0.4.0-dev.22.patch` for the pattern.

#### Source patch (`src/make-adapter.ts`)

Lines 71-83 — replace `_tag: 'storage'` with `_tag: 'in-memory'` for both `dbState` and `dbEventlog`:

```diff
-    const dbState = yield* makeSqliteDb({
-      _tag: 'storage',
-      storage,
-      fileName: stateDbFileName,
-      configureDb: () => {},
-    }).pipe(UnknownError.mapToUnknownError)
+    const dbState = yield* makeSqliteDb({
+      _tag: 'in-memory',
+      configureDb: () => {},
+    }).pipe(UnknownError.mapToUnknownError)

-    const dbEventlog = yield* makeSqliteDb({
-      _tag: 'storage',
-      storage,
-      fileName: eventlogDbFileName,
-      configureDb: () => {},
-    }).pipe(UnknownError.mapToUnknownError)
+    const dbEventlog = yield* makeSqliteDb({
+      _tag: 'in-memory',
+      configureDb: () => {},
+    }).pipe(UnknownError.mapToUnknownError)
```

Note: `storage` and `fileName` parameters are **not needed** for `_tag: 'in-memory'` — the type is `CloudflareDatabaseInputInMemory = { _tag: 'in-memory', configureDb?: (db: SqliteDb) => void }` (see `sqlite-wasm/src/cf/mod.ts:37-40`).

#### Dist patch (`dist/make-adapter.js`)

Lines 25-36 — same change in compiled JS:

```diff
-    const dbState = yield* makeSqliteDb({
-        _tag: 'storage',
-        storage,
-        fileName: stateDbFileName,
-        configureDb: () => { },
-    }).pipe(UnknownError.mapToUnknownError);
+    const dbState = yield* makeSqliteDb({
+        _tag: 'in-memory',
+        configureDb: () => { },
+    }).pipe(UnknownError.mapToUnknownError);
-    const dbEventlog = yield* makeSqliteDb({
-        _tag: 'storage',
-        storage,
-        fileName: eventlogDbFileName,
-        configureDb: () => { },
-    }).pipe(UnknownError.mapToUnknownError);
+    const dbEventlog = yield* makeSqliteDb({
+        _tag: 'in-memory',
+        configureDb: () => { },
+    }).pipe(UnknownError.mapToUnknownError);
```

#### How to create the patch

```bash
# 1. Start the patch
bun patch @livestore/adapter-cloudflare

# 2. Edit both files as shown above:
#    - node_modules/@livestore/adapter-cloudflare/src/make-adapter.ts (lines 71-83)
#    - node_modules/@livestore/adapter-cloudflare/dist/make-adapter.js (lines 25-36)

# 3. Commit the patch (bun will print the exact command after step 1)
bun patch --commit <temp-dir-from-step-1>

# 4. Verify patch file was created
cat patches/@livestore%2Fadapter-cloudflare@0.4.0-dev.22.patch
```

#### Runtime behavior after the patch

1. DO wakes up → `makeAdapter()` called
2. `loadSqlite3Wasm()` → loads wa-sqlite with session extension (unchanged)
3. `sqliteDbFactory({ sqlite3 })` → creates factory (unchanged)
4. `syncInMemoryDb` created via `_tag: 'in-memory'` (already was in-memory — unchanged)
5. **`dbState` created via `_tag: 'in-memory'`** → `MemoryVFS`, pages in heap (**CHANGED** — was CloudflareSqlVFS)
6. **`dbEventlog` created via `_tag: 'in-memory'`** → `MemoryVFS`, pages in heap (**CHANGED** — was CloudflareSqlVFS)
7. `makeLeaderThreadLayer()` → initializes livestore with in-memory DBs
8. `livePull` detects empty eventlog → pulls full history from SyncBackendDO (native SQLite reads)
9. `rematerializeFromEventlog()` → replays events into in-memory state DB
10. `store.query(tables.tags)` → reads from in-memory state (works normally)
11. `store.commit(event)` → writes to in-memory eventlog + pushes to SyncBackendDO via RPC
12. SyncBackendDO writes to native SQLite (~2 rows_written per event)
13. DO goes idle → evicted → all in-memory state lost → rebuilt on next wake-up

**rows_written in LinkProcessorDO: 0.** All durable writes go to SyncBackendDO.

#### Verification: rows_written instrumentation

Use `SqlStorageCursor.rowsWritten` — the CF-provided billing metric — to verify zero VFS writes. Wrap `ctx.storage.sql.exec()` to accumulate total `rowsWritten` across all calls in one DO lifecycle:

```typescript
// Add to LinkProcessorDO class
private totalRowsWritten = 0;

private instrumentSqlStorage(): void {
  const origExec = this.ctx.storage.sql.exec.bind(this.ctx.storage.sql);
  this.ctx.storage.sql.exec = (...args: Parameters<typeof origExec>) => {
    const cursor = origExec(...args);
    this.totalRowsWritten += cursor.rowsWritten;
    return cursor;
  };
}
```

Call `this.instrumentSqlStorage()` in the constructor. After processing, log the result:

```typescript
logger.info("Cycle complete", {
  totalRowsWritten: this.totalRowsWritten, // expect: 0
  storeId: maskId(this.storeId ?? ""),
});
```

**Expected results:**

- **Before patch (CloudflareSqlVFS):** `totalRowsWritten` = hundreds–thousands per link (VFS block writes + indexes)
- **After patch (MemoryVFS):** `totalRowsWritten` = **0** (nothing calls `ctx.storage.sql.exec()`)

Note: `ctx.storage.put("sessionId", ...)` and `ctx.storage.put("storeId", ...)` are KV-style operations — they don't go through `sql.exec()` and don't count toward `rows_written`.

This instrumentation can stay in production as a monitoring guard. If `totalRowsWritten > 0` after the patch, something unexpected is writing to native SQL.

#### Post-deploy verification

```bash
# CF GraphQL — same query that identified the 114k problem
./scripts/do-metrics.sh  # expect ~0 from LinkProcessorDO namespace (0cc85e49...)
```

#### Re-enable triggers after verification ✅ Done

All three triggers have been re-enabled in code (verified 2026-02-27).

## Original Queue Proposal

> **Note:** This was the original Phase 2 proposal. It was superseded by the Dual-Path Ingestion design — see the main doc for the current design.

Replace fire-and-forget dispatch with a durable queue. LinkProcessorDO still uses in-memory livestore.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ INGESTION                                                               │
│                                                                         │
│   Browser ──→ SyncBackendDO.onPush() ──┐                               │
│   Telegram ──→ Worker route ───────────┤                                │
│   API ──→ Worker route ────────────────┤                                │
│   Reprocess button ──→ Worker route ───┘                                │
│                                        │                                │
│                               env.LINK_QUEUE.send()                     │
│                                        │                                │
│                                        ▼                                │
│                            ┌──────────────────┐                         │
│                            │  Cloudflare Queue │                        │
│                            │  { linkId, url,   │                        │
│                            │    orgId }         │                        │
│                            └────────┬─────────┘                         │
└─────────────────────────────────────┼───────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Queue Consumer (same Worker, queue() handler)                           │
│                                                                         │
│   for each message in batch:                                            │
│     → get LinkProcessorDO stub (idFromName(orgId))                     │
│     → call DO.process(linkId, url)                                      │
│     → success: message.ack()                                            │
│     → failure: message.retry({                                          │
│         delaySeconds: Math.min(60 * 2^(message.attempts-1), 3600)      │
│       })                                                                │
│     (after max_retries exhausted → message moves to DLQ)               │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ LinkProcessorDO (per org, single-threaded)                              │
│                                                                         │
│   1. Ensure livestore synced                                            │
│      (livePull complete, materializers up to date)                      │
│                                                                         │
│   2. Process single link via Effect pipeline                            │
│      MetadataFetcher (10s timeout) ──→ ContentExtractor (15s) ──→      │
│      AiSummaryGenerator (30s) — all injected via Effect Layer           │
│                                                                         │
│   3. Commit result events via LinkStore service                         │
│      store.commit() ──→ push to SyncBackendDO ──→ broadcast to clients │
│                                                                         │
│   4. Return success/failure to consumer                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

**How failures are handled:**

```
Message A: { linkId: "1", orgId: "org1" }     ← arrives first
Message B: { linkId: "2", orgId: "org1" }     ← arrives second

Consumer processes Message A:
  → DO.process("1") → metadata fetch hangs → Effect.timeout fires at 10s
  → processLink catches timeout → commits linkProcessingFailed
  → returns { status: "failed" } to consumer
  → consumer calls message.ack()              ← ACK (failure is committed)
  → user can retry from UI ("Regenerate")

Consumer processes Message B (not blocked):
  → DO.process("2") → succeeds
  → consumer calls message.ack()
  → Message B done ✅

Queue retries only for infrastructure failures (DO crash, store dead):
  → HTTP call to DO fails → message not acked → queue retries
  → after max_retries (3) → DLQ
```

**Key difference:** Each link is an independent queue message. Failed links retry independently with manual exponential backoff. One stuck link never blocks others.

**Queue behavior (fact-checked):**

| Concern          | Before (fire-and-forget)             | After (Queue)                                                    |
| ---------------- | ------------------------------------ | ---------------------------------------------------------------- |
| Link dispatch    | `fetch()` — lost if DO busy/erroring | Durable message — persisted until processed                      |
| Retry on failure | None                                 | Manual exponential backoff via `message.retry({ delaySeconds })` |
| Stuck link       | Blocks all subsequent links          | Only that message retries; others proceed                        |
| Dead links       | Stuck forever (no detection)         | DLQ after max_retries (must configure explicitly)                |
| Backpressure     | Links dropped silently               | Messages wait in queue                                           |
| Ordering         | Sequential by subscription           | **Best-effort only** — not FIFO guaranteed                       |
| Concurrency      | N/A                                  | `max_concurrency = 1` recommended; DO serializes anyway          |

**Important caveats (from Cloudflare docs):**

- **No automatic exponential backoff** — Queues only support flat `retry_delay`. Exponential backoff must be implemented manually using `message.attempts` and `message.retry({ delaySeconds })`.
- **No FIFO guarantee** — Messages may arrive out of order, especially after retries. This is fine for link processing since each link is independent (idempotent via `.onConflict`).
- **DLQ must be configured** — Without explicit `dead_letter_queue` in wrangler.toml, exhausted messages are permanently deleted.
- **DO serializes concurrent calls** — Even if multiple consumer invocations call the same DO, the DO processes them one at a time (single-threaded model). Combined with `max_concurrency = 1`, this gives us predictable sequential processing per org.
- **Queue consumer is the same Worker** — Export `queue()` handler alongside Hono's `fetch()`. One consumer per queue limit.

**Recommended wrangler.toml config:**

```toml
[[queues.producers]]
queue = "link-processing"
binding = "LINK_QUEUE"

[[queues.consumers]]
queue = "link-processing"
max_batch_size = 1
max_retries = 3
max_concurrency = 1
dead_letter_queue = "link-processing-dlq"

[[queues.producers]]
queue = "link-processing-dlq"
binding = "LINK_DLQ"
```

**Critical invariant:** The DO must **complete livestore sync before processing**. `createStoreDoPromise` blocks with a 500ms timeout — resolves when SyncBackendDO returns `'NoMore'` (all events materialized) or timeout fires. If sync fails → processing fails → `message.retry()` → queue redelivers later.

**Free tier:** 10,000 ops/day (~3,333 links/day), 24h retention, account-wide. Each retry burns an additional read operation.

## Effect Layer Before/After Examples

**How processLink changed:**

```typescript
// BEFORE: takes raw env + store as params, calls global fetch, no timeouts
export const processLink = (env: Env, store: Store, link: Link) => Effect.gen(function* () {
  const metadata = yield* fetchOgMetadata(link.url);  // no timeout, no retry
  const result = yield* generateSummary(env, ...);     // no timeout, no retry
  store.commit(events.linkSummarized(...));             // not Effect-based
})

// AFTER: depends on services via Effect context, all I/O has timeout + retry
export const processLink = (params: ProcessLinkParams) => Effect.gen(function* () {
  const metadataFetcher = yield* MetadataFetcher;        // injected
  const contentExtractor = yield* ContentExtractor;      // injected
  const aiGenerator = yield* AiSummaryGenerator;         // injected
  const store = yield* LinkStore;                        // injected

  const metadata = yield* metadataFetcher.fetch(link.url);  // 10s timeout + 2x retry inside
  const content = yield* contentExtractor.extract(link.url); // 15s timeout + 2x retry inside
  const result = yield* aiGenerator.generate({...});         // 30s timeout + 3x retry inside
  yield* store.commit(events.linkSummarized({...}));         // Effect-based
})
// Type: Effect<void, never, MetadataFetcher | ContentExtractor | AiSummaryGenerator | LinkStore>
```

**How the DO provides live layers:**

```typescript
// In durable-object.ts
const LiveLayer = Layer.mergeAll(
  MetadataFetcher.Live,
  ContentExtractor.Live,
  AiSummaryGenerator.Live(this.env),
  LinkStore.Live(store)
);

await processLink({ link, aiSummaryEnabled }).pipe(
  Effect.provide(LiveLayer),
  runWithLogger("LinkProcessorDO")
);
```

**How tests swap in mocks:**

```typescript
// In process-link.test.ts
const TestLayer = Layer.mergeAll(
  MetadataFetcher.Test,
  ContentExtractor.Test,
  AiSummaryGenerator.Test,
  LinkStore.Test
);

await processLink({ link, aiSummaryEnabled: true }).pipe(
  Effect.provide(TestLayer),
  Effect.runPromise
);
// Assert: LinkStore.Test._getCommitted() contains expected events
```

**Files changed (processLink refactor, 2026-02-27):**

| File                                                   | Change                                                                                                   |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `link-processor/services.ts`                           | **New** — 4 service Tags (`MetadataFetcher`, `ContentExtractor`, `AiSummaryGenerator`, `LinkEventStore`) |
| `link-processor/services/metadata-fetcher.live.ts`     | **New** — Live layer (10s timeout, 2x exponential retry)                                                 |
| `link-processor/services/content-extractor.live.ts`    | **New** — Live layer (15s timeout, 2x exponential retry)                                                 |
| `link-processor/services/ai-summary-generator.live.ts` | **New** — Live layer (30s timeout)                                                                       |
| `link-processor/services/link-event-store.live.ts`     | **New** — Live layer wrapping `store.commit`/`store.query`                                               |
| `link-processor/process-link.ts`                       | Use `yield* MetadataFetcher` etc. instead of raw `env`/`store` params                                    |
| `link-processor/durable-object.ts`                     | Assemble `Layer.mergeAll(...)` and `Effect.provide(liveLayer)`                                           |
| `link-processor/types.ts`                              | Renamed `LinkStore` → `LivestoreInstance`                                                                |
| `__tests__/unit/process-link.test.ts`                  | **New** — 5 unit tests with inline test layers                                                           |

**Files changed (DO programs refactor, 2026-03-02):**

| File                                              | Change                                                                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `link-processor/services.ts`                      | Added 3 service Tags (`SourceNotifier`, `FeatureStore`, `LinkRepository`) + `Link`/`Status` type exports               |
| `link-processor/do-programs.ts`                   | **New** — 3 Effect programs (`ingestLink`, `cancelStaleLinks`, `notifyResult`) + 1 pure function (`detectStuckLinks`)  |
| `link-processor/services/source-notifier.live.ts` | **New** — Live layer wrapping Grammy `Api` for Telegram reactions/replies                                              |
| `link-processor/services/feature-store.live.ts`   | **New** — Live layer wrapping D1/Drizzle org feature query                                                             |
| `link-processor/services/link-repository.live.ts` | **New** — Live layer wrapping livestore `Store` queries                                                                |
| `link-processor/durable-object.ts`                | Simplified — delegates to Effect programs, deleted `reactToSource`/`replyToSource`/`getFeatures`, added `buildDoLayer` |
| `__tests__/unit/do-programs.test.ts`              | **New** — 14 unit tests with `createTestRepo`/`createTestNotifier` helpers                                             |

## Problem Statement + Evidence

### 1. VFS Write Amplification (production blocker)

LinkProcessorDO hit **114,161 rows_written on Feb 11** (~99.9% of all DO writes), exceeding the free tier 100k/day limit. SyncBackendDO wrote only **141 rows** the same day. Root cause: wasm SQLite + CloudflareSqlVFS stores DB pages as 64 KiB blocks in `vfs_blocks` table — each logical write amplifies to multiple native rows. **Mitigated** by the in-memory bun patch (see Phase 1).

### 2. Processing Reliability (ongoing)

Even with VFS solved, the processing architecture had fundamental issues:

- **Sequential processing bottleneck** — one stuck/hanging link blocks all subsequent links indefinitely
- **No timeouts** on metadata fetch, content extraction, or AI generation
- **Race conditions** in reprocess flow (fixed but indicative of fragile design)
- **No periodic retry** — stuck links are never recovered without external trigger
- **Tight coupling to livestore** — full client initialization (eventlog replay) on every DO wake-up

See `docs/debugging/2026-02-23-link-processor-stuck.md` for detailed incident history.

### Evidence 1: LinkProcessorDO is the culprit (MEASURED)

CF GraphQL `durableObjectsPeriodicGroups` dataset, queried via `scripts/do-metrics.sh`:

| Namespace                                          | Feb 11 rows_written |
| -------------------------------------------------- | ------------------- |
| LinkProcessorDO (`0cc85e49...`, wasm SQLite + VFS) | **114,161**         |
| SyncBackendDO (`e96f6022...`, native SQLite)       | **141**             |

### Evidence 2: VFS write path is unbuffered (SOURCE CODE VERIFIED)

Traced through the livestore source (`readonly-llm-lookup/livestore/`):

**`CloudflareSqlVFS.jWrite()`** (`packages/@livestore/sqlite-wasm/src/cf/CloudflareSqlVFS.ts:253-299`):

- Each wasm SQLite page write calls `jWrite()`
- `jWrite()` immediately calls `BlockManager.writeBlocks()`
- No buffering, no deduplication

**`BlockManager.writeBlocks()`** (`packages/@livestore/sqlite-wasm/src/cf/BlockManager.ts:74-87`):

```typescript
writeBlocks(sql: CfTypes.SqlStorage, filePath: string, blocks: Map<number, Uint8Array>): void {
  for (const [blockId, data] of blocks) {
    sql.exec(
      'INSERT OR REPLACE INTO vfs_blocks (file_path, block_id, block_data) VALUES (?, ?, ?)',
      filePath, blockId, data,  // 64 KiB BLOB per block
    )
  }
}
```

Each `sql.exec()` = 1 native DO SqlStorage write. But `rows_written` cost is **higher than 1** — see Evidence 5.

**`jSync()` is a no-op** (`CloudflareSqlVFS.ts:340-347`):

```typescript
jSync(fileId: number, _flags: number): number {
  // SQL storage provides immediate durability, so sync is effectively a no-op
  return VFS.SQLITE_OK
}
```

### Evidence 3: Each store.commit() costs 3+ native writes minimum (SOURCE CODE VERIFIED)

Traced through `materialize-event.ts:97-125`:

| Step                                      | SQL statement                               | VFS result                           |
| ----------------------------------------- | ------------------------------------------- | ------------------------------------ |
| Materializer SQL (e.g. INSERT INTO links) | 1-3 statements on dbState                   | 1+ `vfs_blocks` writes per statement |
| Session changeset recording               | INSERT into `__livestore_session_changeset` | 1+ `vfs_blocks` writes               |
| Eventlog insert                           | INSERT into eventlog                        | 1+ `vfs_blocks` writes               |
| **Minimum total per commit**              |                                             | **3+ `vfs_blocks` writes**           |

The number of `store.commit()` calls per link depends on the code path (`process-link.ts`):

| Scenario                      | Commits | Events                                                                      |
| ----------------------------- | ------- | --------------------------------------------------------------------------- |
| No AI, metadata succeeds      | **3**   | `linkProcessingStarted` + `linkMetadataFetched` + `linkProcessingCompleted` |
| No AI, metadata fails         | **2**   | `linkProcessingStarted` + `linkProcessingCompleted`                         |
| AI enabled, 3 tag suggestions | **6**   | + `linkSummarized` + 3× `tagSuggested`                                      |
| Error                         | **2**   | `linkProcessingStarted` + `linkProcessingFailed`                            |

With AI disabled (common case): **3 commits × 3+ VFS block writes = 9+ block writes per link**.
With AI + tags: **6 commits × 3+ = 18+ block writes per link**.

Note: AI mode also calls `store.query(tables.tags)` which reads from the **materialized state DB** — this is why the materializer (and therefore wasm SQLite) exists in LinkProcessorDO.

### Evidence 4: VFS stores data as 64 KiB blocks (SOURCE CODE VERIFIED)

`CloudflareSqlVFS.ts:9`: `const BLOCK_SIZE = 64 * 1024`

Tables created in native DO SqlStorage:

```sql
CREATE TABLE vfs_files (file_path TEXT PRIMARY KEY, file_size INTEGER, ...)
CREATE TABLE vfs_blocks (file_path TEXT, block_id INTEGER, block_data BLOB, PRIMARY KEY (file_path, block_id))
```

Plus indices: `idx_vfs_blocks_range`, `idx_vfs_files_modified`, and a trigger `trg_vfs_files_update_modified`.

### Evidence 5: Each VFS block write costs 2-4 rows_written (CF DOCS + SOURCE CODE)

CF bills `rows_written` per-row **including index updates** ([D1 pricing docs](https://developers.cloudflare.com/d1/platform/pricing/)):

> "Indexes will add an additional written row when writes include the indexed column, as there are two rows written: one to the table itself, and one to the index."

The `vfs_blocks` table has:

- `PRIMARY KEY (file_path, block_id)` — this IS an index in SQLite → **+1 rows_written**
- `idx_vfs_blocks_range` — secondary index → **+1 rows_written**
- `trg_vfs_files_update_modified` — trigger on `vfs_files` updates → **+0-1 rows_written** (unclear if triggers count)

**So each `INSERT OR REPLACE INTO vfs_blocks` likely costs 2-3 `rows_written`** (1 row + 1-2 indexes), not just 1.

Additionally, `INSERT OR REPLACE` that replaces an existing row may count as **2 operations** (delete + insert) — CF likely counts at the storage layer, not via `sqlite3_changes()` which excludes REPLACE deletes. This would double the cost to **4-6 rows_written per VFS block write** on updates.

Other CF billing details relevant to the VFS:

- `BEGIN`/`COMMIT` transactions do **not** add to `rows_written`
- `CREATE TABLE IF NOT EXISTS` on existing tables = **0 rows_written**
- `SELECT` queries with `IN`/`OR` clauses can incur `rows_written` (SQLite creates internal ephemeral tables)
- The 100k/day limit is **account-wide** across all DOs and Workers projects, resets at 00:00 UTC

### Evidence 6: SqlStorageCursor.rowsWritten can measure actual cost (CF DOCS)

`ctx.storage.sql.exec()` returns a `SqlStorageCursor` with a `rowsWritten` property:

> "The number of rows written so far as part of this SQL query. The final value is used for SQL billing."

This is the **definitive** way to verify the actual cost. We could instrument `BlockManager.writeBlocks()` to log `cursor.rowsWritten` per VFS block write. However, this requires patching livestore — `BlockManager` currently calls `sql.exec()` without reading the cursor.

### Revised cost estimate (theoretical)

| Per link                     | No AI (3 commits) | AI + 3 tags (6 commits) |
| ---------------------------- | ----------------- | ----------------------- |
| VFS block writes             | ~9-15             | ~18-30                  |
| rows_written (2-3 per block) | **~18-45**        | **~36-90**              |
| rows_written (4-6 per block) | **~36-90**        | **~72-180**             |

At the realistic estimate (2-3 rows/block), **114k rows_written ÷ ~30 rows/link ≈ ~3,800 links processed** — or significantly fewer if AI was enabled. This also includes DO wake-up overhead (VFS table creation, initial sync).

### Evidence 7: Measured baseline via SqlStorageCursor.rowsWritten (LOCAL, 2026-02-12)

Instrumented `ctx.storage.sql.exec()` in LinkProcessorDO constructor to accumulate `cursor.rowsWritten` across all calls. Tested locally with `bun dev`, AI summary enabled, 1 link processed.

**Test:** Single link with AI enabled → 6 commits (`LinkProcessingStarted`, `LinkMetadataFetched`, `LinkSummarized`, 2× `TagSuggested`, `LinkProcessingCompleted`).

| Metric                                                                          | Measured               |
| ------------------------------------------------------------------------------- | ---------------------- |
| **DO initialization** (store creation, VFS tables, livePull, rematerialization) | **3,772 rows_written** |
| **Per-link processing** (AI + 2 tag suggestions, 6 commits)                     | **854 rows_written**   |
| **Total DO lifecycle** (init + 1 link)                                          | **4,626 rows_written** |
| **Per commit** (~6 commits)                                                     | **~142 rows_written**  |

**Capacity at 100k/day limit:**

| Scenario                                            | rows_written/link | Max links/day |
| --------------------------------------------------- | ----------------- | ------------- |
| DO stays warm (no re-init)                          | 854               | ~117          |
| DO evicted between each link (cold start each time) | 4,626             | ~21           |
| Realistic (mix of warm + cold)                      | ~1,500–3,000      | ~33–66        |

**Key findings:**

- The theoretical estimate (36-90 rows/link for AI) was **~10x too low** — actual cost is **854 rows_written** per link
- DO initialization is **4.4x more expensive** than processing a single link
- Per-commit cost (~142 rows_written) implies ~24 VFS block writes per commit at 2-3 rows_written per block, or ~36 at 4-6 — much higher than the theoretical 3+ minimum
- The Feb 11 incident (114k rows_written) could have been caused by as few as **~25 links** if the DO was cold-starting frequently

### Evidence 8: After Phase 1 patch: zero rows_written (LOCAL, 2026-02-12)

Applied `bun patch` switching `_tag: 'storage'` → `_tag: 'in-memory'` for `dbState` and `dbEventlog` in `@livestore/adapter-cloudflare`. Same test: single link, AI enabled, 6 commits.

| Metric                            | Before patch       | After patch |
| --------------------------------- | ------------------ | ----------- |
| DO initialization                 | 3,772 rows_written | **0**       |
| Per-link processing (AI + 2 tags) | 854 rows_written   | **0**       |
| Total DO lifecycle                | 4,626 rows_written | **0**       |

All events still push to SyncBackendDO via RPC and broadcast to WebSocket clients normally. Link processing flow unchanged — metadata fetched, AI summary generated, tag suggestions emitted, processing completed.

## Why Livestore Uses Wasm SQLite

### The architecture

```
┌────────────────────────────────────┐
│  LiveStore (wasm SQLite)           │
│  - Full SQLite with extensions     │
│  - Session extension for rollback  │
│  - Forked wa-sqlite package        │
└──────────────┬─────────────────────┘
               │
┌──────────────▼─────────────────────┐
│  CloudflareSqlVFS                  │
│  - Virtual file system layer       │
│  - Stores DB as 64 KiB blocks     │
│  - jWrite() → sql.exec() per block│
└──────────────┬─────────────────────┘
               │
┌──────────────▼─────────────────────┐
│  ctx.storage.sql (native CF API)   │
│  - Persists vfs_files/vfs_blocks   │
│  - Only exec() + databaseSize      │
│  - No session extension            │
└────────────────────────────────────┘
```

### Why wasm? Five capabilities CF's native SQL lacks.

Livestore uses a **forked `wa-sqlite`** (`@livestore/wa-sqlite`) compiled with session, preupdate hook, and bytecode vtab extensions. CF's native `ctx.storage.sql` cannot replace it for **5 independent reasons**:

| Capability                                                                      | Used for                                                                 | CF native SQL                 |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------- |
| **Session extension** (`session_create`, `changeset_invert`, `changeset_apply`) | Rebase/rollback — core sync mechanism                                    | Not available                 |
| **Serialize / Export** (`sqlite3.serialize()`)                                  | State snapshots for sync, devtools                                       | Not available                 |
| **Deserialize + Backup** (`sqlite3.deserialize()`, `sqlite3.backup()`)          | Restoring state from snapshots, `syncInMemoryDb.import(initialSnapshot)` | Not available                 |
| **Multiple independent databases**                                              | State db + eventlog db + sync in-memory db (3 separate files via VFS)    | Not available (1 DB per DO)   |
| **Low-level statement API** (`prepare`, `step`, `bind`, `column`)               | Fine-grained query control, column type handling                         | Not available (only `exec()`) |

Source: livestore docs (`docs/src/content/docs/building-with-livestore/state/sqlite.md`):

> "LiveStore uses the `session` extension to enable efficient database rollback which is needed when the eventlog is rolled back as part of a rebase."

The session extension is the **most critical** blocker — it's the foundation of livestore's optimistic concurrency model. But even if CF added session support, the other 4 gaps would remain.

### Historical context

The VFS approach predates CF's SQLite storage API. Livestore originally had `CloudflareWorkerVFS` using the KV-style `storage.get/put/delete` API (async, with LRU cache). When CF launched SQL storage (beta Sept 2024, GA April 2025), livestore created `CloudflareSqlVFS` as an improvement — synchronous I/O matching wa-sqlite's sync VFS interface. The VFS-over-native-SQL architecture was always necessary; only the underlying storage changed.

### The materializer calls session() unconditionally (SOURCE CODE VERIFIED)

`packages/@livestore/common/src/leader-thread/materialize-event.ts:97-108`:

```typescript
const session = dbState.session();

for (const { statementSql, bindValues } of execArgsArr) {
  yield * execSqlPrepared(dbState, statementSql, bindValues);
}

const changeset = session.changeset();
session.finish();
```

This runs for **every** event: local commits, remote pulls, and rebase events. Not conditional.

The changeset blob is stored in `__livestore_session_changeset` and later used for rollback:

```typescript
// materialize-event.ts:169-200 (rollback path)
dbState.makeChangeset(changeset).invert().apply();
```

### CF's native SQL API doesn't have session support

`ctx.storage.sql` only exposes `exec()` and `databaseSize`. No `session_*`, `changeset_*`, `serialize()`, `deserialize()`, or `backup()` methods.

Livestore's own "public API" adapter (`make-sqlite-db.ts:219`) confirms:

> "NOTE: Session tracking not supported with public API. This functionality requires undocumented session\_\* methods."

### The "public API" adapter exists but stubs critical methods

`packages/@livestore/adapter-cloudflare/src/make-sqlite-db.ts` wraps `ctx.storage.sql` directly (zero VFS):

```typescript
session: () => ({
  changeset: () => new Uint8Array(), // empty — no change tracking
  finish: () => {},
});

makeChangeset: (_data) => ({
  invert: () => {
    throw new SqliteError({ cause: "not supported" });
  },
  apply: () => {
    throw new SqliteError({ cause: "not supported" });
  },
});
```

This adapter is **not used** by `makeAdapter` (which hardcodes the wasm path at `make-adapter.ts:49-51`).

## Assumptions (Needs Verification)

### 1. Exact rows_written per VFS block write (NOT YET MEASURED)

We know each `INSERT OR REPLACE INTO vfs_blocks` costs **at least 2 rows_written** (row + PRIMARY KEY index) and possibly 3-6 (secondary index + trigger + REPLACE=delete+insert). The exact number depends on CF's internal counting mechanism.

**To verify:** Patch `BlockManager.writeBlocks()` to read `cursor.rowsWritten` from `sql.exec()` return value. Or write a standalone DO test that creates a `vfs_blocks`-like table and measures `INSERT OR REPLACE` cost via `SqlStorageCursor.rowsWritten`.

### 2. VFS write amplification is the primary cost driver (LIKELY BUT NOT DIRECTLY MEASURED)

We measured **total rows_written per namespace** via GraphQL but haven't measured **per-commit VFS writes** in isolation. The 114k figure includes DO wake-up writes, table creation, and ongoing syncs — not just link processing commits.

**To verify:** Instrument `BlockManager.writeBlocks()` to count writes per commit, or query `SELECT COUNT(*) FROM vfs_blocks` before and after a single commit.

### 3. Batching commits won't help significantly (THEORETICAL)

We reasoned that VFS flushes per `jWrite()` call (per SQL statement), not per transaction. So batching 7 commits into 1 should only save BEGIN/COMMIT overhead.

**To verify:** Actually batch commits and measure `vfs_blocks` row count delta.

### 4. VFS write batching via jSync would achieve ~50% reduction (ESTIMATED)

We estimated that buffering writes in `jWrite()` and deduplicating in `jSync()` could reduce writes by ~50% because SQLite often writes the same block multiple times within a transaction.

**To verify:** Implement the patch and measure actual deduplication ratio.

### 5. Rebase never triggers for LinkProcessorDO (ASSUMED)

LinkProcessorDO is a sequential server-side client. Rebase happens when local events conflict with server events. If LinkProcessorDO only commits (never receives conflicting remote events), rebase should never trigger — making the empty `session()` stubs safe.

**To verify:** Check if `livePull: true` in `createStoreDoPromise` causes the DO to receive events that could trigger rebase. Check `pullFilter` configuration.

## Known Processing Issues + Incidents

### Incident Timeline

| Date   | Incident                               | Root Cause                                                                                                                        | Fix                                                                            |
| ------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Feb 9  | 1-hour sync outage                     | `getSession()` ~10ms CPU + livestore infinite 1s retries → request storm                                                          | Bun patch: exponential backoff (5 retries, 31s). Session cookie cache (5min)   |
| Feb 11 | 114k rows_written (99.9% of quota)     | Wasm SQLite VFS write amplification                                                                                               | Bun patch: in-memory DBs. Disabled triggers in production                      |
| Feb 23 | Links stuck in "Generating summary..." | UNIQUE constraint crash, no concurrency control, no store shutdown recovery                                                       | Idempotent materializer, sequential `processNextPending`, dead store detection |
| Feb 26 | Regenerate button hangs                | `store.commit()` triggers subscription synchronously → double processing. Client + DO both commit same event → `ServerAheadError` | Concurrency guard, removed redundant commit                                    |

### Incident Reassessment

| Incident                   | Root cause                                              | Platform limit?                              |
| -------------------------- | ------------------------------------------------------- | -------------------------------------------- |
| Feb 9 — 1hr sync outage    | Expensive `getSession()` + infinite 1s retry loop       | No — app bug                                 |
| Feb 11 — 114k rows_written | Wasm SQLite VFS write amplification                     | Free tier limit (fixed with in-memory patch) |
| Feb 23 — stuck summaries   | UNIQUE constraint + no concurrency control + dead store | No — app bugs                                |
| Feb 26 — reprocess hang    | Double commit race + synchronous subscription re-entry  | No — app bug                                 |

### Remaining Unfixed Issues (updated 2026-02-27)

Issues 1-2 are now resolved by the Effect Layer refactoring. Remaining:

1. ~~**Sequential processing bottleneck**~~ — ✅ Fixed. Effect layers add per-step timeouts (10s/15s/30s), so a stuck link can't block indefinitely.

2. ~~**No timeouts on external calls**~~ — ✅ Fixed. Every I/O service has a timeout via Effect layers.

3. **No periodic retry** — Stuck links are only detected when `onPendingLinksChanged` fires (new link arrives). Without that trigger, a stuck link stays stuck forever. The 5-minute `STUCK_TIMEOUT_MS` handler only runs when the subscription fires. A DO alarm could provide periodic checks.

4. **Sync race in handleIngest** — `createStoreDoPromise` blocks ~500ms for initial sync; dedup query may run against incomplete state, allowing duplicate links.

5. **Fire-and-forget trigger** — `SyncBackendDO.onPush` pokes LinkProcessorDO but doesn't verify it started processing. If the DO is busy or erroring, the link is silently dropped until the next push.

6. **Cold start on every wake-up** — With in-memory patch, DO replays the entire eventlog on each wake-up (~120ms now, grows linearly with events).

### Bun Patches

Two patches applied via `bun patch` to work around livestore limitations:

**1. `@livestore/sync-cf` — Retry backoff**

```
Before: Schedule.fixed(1000)                                        → infinite 1s retries
After:  Schedule.exponential('1s', 2).pipe(Schedule.recurs(5))      → 1s, 2s, 4s, 8s, 16s → stop
```

Prevents request storms when auth/sync fails. Patched in both `src/` and `dist/`.

**2. `@livestore/adapter-cloudflare` — In-memory DBs**

```
Before: { _tag: 'storage', storage, fileName: ... }   → wasm SQLite + CloudflareSqlVFS (4-10x write amplification)
After:  { _tag: 'in-memory', configureDb: () => {} }   → MemoryVFS, zero rows_written
```

Eliminates VFS overhead entirely. Events still push to SyncBackendDO (native SQLite) via RPC. Trade-off: all state lost on DO eviction, rebuilt from eventlog on next wake-up.

## Livestore Event Sourcing Tension

### How livestore works

Livestore is an **event-sourced** state management library. Every state change is an immutable event appended to an eventlog. Materialized state (SQLite tables) is derived by replaying events through materializers. Sync between clients happens by exchanging events through a central server (SyncBackendDO).

```
Client A commits event → push to SyncBackendDO → SyncBackendDO stores in native SQLite
                                                → broadcasts to Client B (livePull)
Client B receives event → materializer updates local SQLite state
```

### Two fundamentally different SQLite paths on Cloudflare

|            | SyncBackendDO                            | LinkProcessorDO / ChatAgentDO                        |
| ---------- | ---------------------------------------- | ---------------------------------------------------- |
| SQLite     | **Native** DO SQLite (`ctx.storage.sql`) | **Wasm** (`@livestore/wa-sqlite` + extensions)       |
| Write cost | ~1-2 `rows_written` per event            | ~142 `rows_written` per event (via VFS)              |
| Extensions | None needed (just stores eventlog)       | Session, serialize, preupdate hook, bytecode vtab    |
| Role       | Event storage + sync coordination        | Full client: materializer + queries + event emission |

### Why can't LinkProcessorDO use native DO SQLite?

Cloudflare's `ctx.storage.sql` is a stripped-down SQLite API — it only exposes `exec()` and `databaseSize`. Livestore's wasm SQLite requires **5 capabilities CF doesn't provide**:

1. **Session extension** (`session_create`, `changeset_invert`, `changeset_apply`) — Core sync mechanism. Used for rebase/rollback on every event materialization. CF has no session support.
2. **Serialize/Deserialize** (`sqlite3.serialize()`, `sqlite3.deserialize()`) — State snapshots for sync and devtools.
3. **Multiple independent databases** — Livestore maintains 3 separate SQLite files (state, eventlog, sync). CF provides 1 DB per DO.
4. **Low-level statement API** (`prepare`, `step`, `bind`, `column`) — Fine-grained query control. CF only has `exec()`.
5. **Preupdate hook + bytecode vtab** — Used internally by livestore for change tracking.

The session extension is the **critical** blocker. Livestore calls `session()` on **every** event materialization, unconditionally. A "public API" adapter exists in livestore that stubs `session()` with empty implementations, but `changeset_invert()` throws — meaning any rebase would corrupt data.

**This means we cannot bypass wasm SQLite for any DO that participates in livestore as a full client.** The only way to avoid wasm is to avoid being a livestore client entirely.

### The mismatch

Livestore is designed for **long-lived clients** (browsers, Node.js processes) that maintain persistent state. A Durable Object is **serverless-ish** — it wakes up, does work, and gets evicted. Running a full livestore client inside a DO means:

- **Cold start penalty**: Replay entire eventlog on every wake-up (grows linearly)
- **RAM pressure**: All 3 wasm SQLite DBs in heap (128MB DO limit)
- **Write amplification**: Wasm SQLite + VFS = 70-140x more `rows_written` than native (mitigated by in-memory patch, but traded for cold start)

## Options Analysis

### Ruled Out

| Option                         | Why                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Native DO SQLite adapter**   | CF lacks SQLite extensions livestore requires (session, serialize, preupdate hook, bytecode vtab). Session extension is the critical one — without it, rebase corrupts data.        |
| **Custom changeset tracking**  | Livestore's `makeChangeset(blob).invert().apply()` expects SQLite's native binary changeset format. No way to produce compatible blobs without the session extension.               |
| **DO Alarm-based processing**  | Still sequential within the same DO, still requires full livestore client with cold start. Adds complexity without solving the fundamental architectural issues.                    |
| **R2 as VFS backend**          | R2 API is async (VFS requires sync). Write amplification unchanged. Latency 100x worse (~50ms vs ~0.1ms per op). **R2 as snapshot store is viable** — see Strategy A + R2 Snapshot. |
| **D1 as storage**              | Same 100k rows_written/day limit on free tier.                                                                                                                                      |
| **Raw SQL event injection**    | No built-in server-side push API. Manual seqNum + broadcast = coupled to livestore internals.                                                                                       |
| **Regular CF Worker (not DO)** | Workers are stateless, 10ms CPU. Can't persist wasm SQLite or maintain WebSocket.                                                                                                   |

### Viable — Ordered by Practicality

#### Option 1: In-Memory LiveStore in DO (patch adapter) ★ SELECTED

Patch `makeAdapter` to create `dbState` and `dbEventlog` as **in-memory** (`_tag: 'in-memory'`) instead of persistent (`_tag: 'storage'`). The factory already supports this — `syncInMemoryDb` is already in-memory.

**How it works:**

1. DO wakes up → all DBs created in-memory via `MemoryVFS` (zero native writes)
2. `livePull` pulls full eventlog from SyncBackendDO (native SQLite, reads only)
3. `rematerializeFromEventlog()` rebuilds state from events (streams 100-event chunks)
4. `store.query(tables.tags)` works — full materialized state available
5. `store.commit()` writes to in-memory eventlog + pushes to SyncBackendDO via RPC
6. SyncBackendDO writes to native SQLite (~2 rows_written per event, efficient)
7. DO hibernates → state lost → rebuilt on next wake-up

**rows_written in LinkProcessorDO: 0.** All writes go to SyncBackendDO.

**Cold start cost:** Replay full eventlog. ~1k events ≈ 100ms, ~10k events ≈ 1s. Well within 30s DO CPU limit.

Source code evidence:

- `make-adapter.ts:53` — `syncInMemoryDb` already uses `{ _tag: 'in-memory' }`
- `sqlite-wasm/src/cf/mod.ts:62-75` — `sqliteDbFactory` supports `in-memory` with `MemoryVFS`
- `rematerialize-from-eventlog.ts` — streams 100-event chunks to rebuild state

- **Complexity:** Low — small patch to `make-adapter.ts`
- **Risk:** Low-Medium — session() works in wasm MemoryVFS (full wa-sqlite with extensions). Cold start adds latency but fits in CPU budget.
- **Benefit:** Full materialized state, full tag matching, zero VFS writes, stays on CF free tier

#### Option 2: Headless Node.js Client on External Platform

Livestore ships `@livestore/adapter-node` — uses real SQLite (`better-sqlite3`), zero VFS, zero write amplification. Runs as a long-lived process that syncs via WebSocket to SyncBackendDO.

```
SyncBackendDO (onPush detects LinkCreated)
  → HTTP webhook or Queue message
  → Node.js service (adapter-node, full materialized state)
  → store.commit() → events sync to all clients via WebSocket
```

- **Platform:** Fly.io (~$2/mo), Railway ($5/mo), or self-hosted
- **Complexity:** Medium — set up Node service, auth bypass for server-side client
- **Risk:** Low — `adapter-node` is first-class in livestore, `processLink()` reusable unchanged
- **Benefit:** Full materialized state, handles all triggers (browser, Telegram, API)

#### Option 3: Reconstruct Tags from Eventlog (no materializer needed)

SyncBackendDO already has the eventlog in **native SQLite**. We can rebuild the tag list by querying tag events directly:

```sql
SELECT args FROM "eventlog_7_<storeId>" WHERE name IN ('v1.TagCreated', 'v1.TagDeleted', 'v1.TagRenamed')
```

Then reduce in memory → current tag list. Pass tags to a stateless processor.

- **Complexity:** Medium — eventlog query + tag reducer + stateless Worker/Queue for I/O
- **Risk:** Medium — coupled to event schema; need to get results back into the eventlog
- **Benefit:** Zero VFS, stays on CF free tier
- **Blocker:** Still need a mechanism to commit result events back to livestore (no server-side push API)

#### Option 4: Patch VFS to Buffer Writes (jSync batching)

Modify `CloudflareSqlVFS` to buffer dirty blocks in `jWrite()` and flush deduplicated in `jSync()`.

- **Estimated reduction:** ~50% of VFS block writes (deduplication within transaction)
- **Complexity:** Low — ~50-100 line patch via `bun patch`
- **Risk:** Low — SQLite guarantees `xSync()` at every transaction commit
- **Trade-off:** May not be enough alone — 50% of 114k is still 57k, within limit but tight

#### Option 5: Reduce Events Per Link

Currently 2-6 `store.commit()` calls per link. Combine into fewer events.

- **Estimated reduction:** ~50-70% if reduced to 1 commit
- **Complexity:** Low — refactor `processLink()` in app code
- **Risk:** Low — purely application-level change
- **Can combine with:** Any other option for multiplicative effect

### Also investigated, not standalone options

| Approach                 | Finding                                                                                                                                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RPC to SyncBackendDO** | SyncBackendDO exposes `Pull`, `Push`, `Ping` via RPC. Push works for sending events. But no query API — can't ask "give me tags". Must pull full eventlog and materialize locally, which is what Option 1 already does. |
| **Simpler materializer** | The materializer isn't the cost driver — VFS persistence is. A custom reducer loses livestore's reactivity (memoization, dependency tracking) without solving the write problem.                                        |
| **CF Paid plan ($5/mo)** | 50M rows_written/month — solves the problem but wasteful. Not pursuing for now.                                                                                                                                         |

## Refined Options

### The fundamental tension

Server-side link processing needs:

1. **Event emission** — commit events with correct seq numbers, push to SyncBackendDO
2. **Tag query** — read current tags for AI matching (only when AI enabled)

Livestore provides both, but at the cost of a full client: wasm SQLite, eventlog replay, materialized state. On the VFS path this costs 114k `rows_written/day`. On the in-memory path it costs cold start + RAM that grow linearly.

### Strategy A: Accept growth, mitigate later ★ PHASE 1

**In-Memory LiveStore patch (original Option 1).**

- Patch `make-adapter.ts` to use `_tag: 'in-memory'` for `dbState` and `dbEventlog`
- Zero `rows_written` from LinkProcessorDO
- Cold start + RAM acceptable at current scale (<1k links)
- Revisit when eventlog approaches ~10k events

**Effort:** Low — small `bun patch`
**Risk:** Low — verified in source, same wa-sqlite binary
**Horizon:** Months to years at personal app scale

### Strategy A + R2 Snapshot: Bounded cold start ★ PHASE 3

Extend Strategy A with R2-backed snapshot persistence. Instead of replaying the full eventlog on every wake-up, restore from a snapshot and only replay the delta.

**How it works:**

```
Wake-up:
  1. R2 GET snapshot (~50ms)           ← single object, all 3 serialized DBs
  2. sqlite3.deserialize() into        ← restore state + eventlog + sync DBs
     in-memory DBs
  3. livePull delta sync               ← only events since snapshot
     (sessionId persisted in DO storage)
  4. rematerialize delta only           ← fast, bounded by events since last snapshot
  5. Process link(s)

Shutdown:
  6. sqlite3.serialize() all DBs       ← ~50-500 KiB for <5k links
  7. R2 PUT snapshot (~50ms)            ← single object
```

**Cost model:**

|                                | Phase 1 (in-memory only)              | Phase 2 (+ R2 snapshot)           |
| ------------------------------ | ------------------------------------- | --------------------------------- |
| rows_written (LinkProcessorDO) | 0                                     | 0                                 |
| Cold start                     | Full eventlog replay (grows linearly) | R2 GET + delta replay (bounded)   |
| RAM                            | Full eventlog + state in heap         | Same (snapshot loads into memory) |
| R2 ops/cycle                   | 0                                     | 2 (GET + PUT)                     |
| R2 storage                     | 0                                     | ~50 KiB–5 MB per org              |

**Effort:** Medium — R2 binding, serialize/deserialize logic, adapter patch
**Risk:** Medium — snapshot restore + livestore delta sync integration not yet verified
**Horizon:** When Phase 1 cold start becomes a problem (~5k–10k events)

### Strategy B: Eliminate LiveStore from processor entirely

Replace the full livestore client with:

1. **Tag query via SyncBackendDO RPC** — add `getTags(storeId)` method to SyncBackendDO that queries its native SQLite eventlog:
   ```sql
   SELECT argsJson FROM eventlog
   WHERE name IN ('v1.TagCreated', 'v1.TagDeleted', 'v1.TagRenamed')
   ORDER BY seqNumGlobal ASC
   ```
   Reduce in memory → current tag list. Zero writes, zero materialization.
2. **Event emission via SyncBackendDO Push RPC** — construct valid event payloads and push them through the existing sync protocol. Need to handle seq number assignment.

LinkProcessorDO becomes a simple stateless DO:

- Receives `{ linkId, url, storeId }` from SyncBackendDO
- Calls `SyncBackendDO.getTags(storeId)` via RPC
- Fetches metadata, calls AI
- Pushes result events via SyncBackendDO's Push
- No wasm SQLite, no VFS, no materializer, no cold start, minimal RAM

**Unsolved:** How to construct valid livestore events (seq numbers, clientId, sessionId, sync metadata) without a livestore client. Options:

- Extend SyncBackendDO with a "server-side commit" API that handles seq assignment internally
- Use a minimal livestore client just for event format (but then we're back to pulling eventlog)
- Write directly to eventlog table + broadcast (couples to livestore internals, fragile)

**Effort:** High — new RPC methods, event construction, testing
**Risk:** Medium — coupling to livestore internals (eventlog schema, sync protocol)
**Horizon:** Permanent solution if done right

### Strategy C: Move tag matching to client

Server-side processor only does metadata + AI summary. Tag matching happens client-side.

- When browser client receives `linkSummarized` event, it runs `findMatchingTag()` locally (it already has full materialized state)
- LinkProcessorDO no longer needs `store.query(tables.tags)` → can potentially skip materialization
- For Telegram/API: links get metadata + summary immediately, tag suggestions appear when user opens browser

**Problem:** Still need livestore in LinkProcessorDO for event emission. Still pulls full eventlog. Cold start unchanged. This only removes the tag query — which is already only used when AI is enabled.

**Effort:** Medium — move tag matching logic to client, add client-side event handler
**Risk:** Low — purely application-level change
**UX trade-off:** Tag suggestions delayed for external triggers (Telegram, API)
**Verdict:** Doesn't solve the core problem (cold start/RAM) because livestore client is still needed for event emission.

### Strategy D: Cloudflare Queues for Link Dispatch

See the main doc's "Dual-Path Ingestion Design" section for the current architecture.

Decouple link dispatch from processing using Cloudflare Queues as a durable buffer. The Queue holds links to process, but the LinkProcessorDO must **fully sync with livestore before processing the next link** from the queue.

**Available on free tier** (since 2026-02-04): 10,000 ops/day (~3,333 links/day), 24h retention.

**Combines with Strategy A:** LinkProcessorDO still uses in-memory livestore (zero `rows_written`). Queue just replaces the dispatch/retry mechanism.

**Combines with Effect Layers:** Each step has timeouts — if metadata fetch hangs, `Effect.timeout` fires, the link fails gracefully, and the queue retries it later. Without Effect timeouts, the DO would hang forever and never return a failure to the consumer.

**Effort:** Medium — Queue binding, consumer handler, refactor dispatch in SyncBackendDO
**Risk:** Low-Medium — Queue is well-understood infrastructure; main risk is livestore sync timing
**Benefit:** Solves both VFS (via Strategy A) and processing reliability in one architecture

### Strategy comparison

|                      | rows_written  | Cold start                            | Processing reliability             | Testable | Effort | Horizon       |
| -------------------- | ------------- | ------------------------------------- | ---------------------------------- | -------- | ------ | ------------- |
| **A: In-Memory**     | 0 (processor) | Grows with eventlog                   | Same (sequential)                  | No       | Low    | Months–years  |
| **A + R2 Snapshot**  | 0 (processor) | R2 GET + delta (~50ms + small replay) | Same (sequential)                  | No       | Medium | Years         |
| **B: No LiveStore**  | 0 (processor) | None                                  | Depends on design                  | Depends  | High   | Permanent     |
| **C: Client tags**   | 0 (processor) | Same as A                             | Same (sequential)                  | No       | Medium | Same as A     |
| **D: A + Queues**    | 0 (processor) | Same as A                             | **Retry, isolation, backpressure** | No       | Medium | Years         |
| **Effect Layers** ✅ | N/A           | N/A                                   | **Timeouts, retries per step**     | **Yes**  | Medium | Cross-cutting |

### Recommendation (revised 2026-02-27)

**Cross-cutting: Effect Layer refactoring** ✅ — Completed 2026-02-27. `processLink` now uses 5 injectable services (`MetadataFetcher`, `ContentExtractor`, `AiSummaryGenerator`, `WorkersAi`, `LinkEventStore`) with per-step timeouts and retries. 8 unit tests with inline test layers.

**Phase 1 (done): Strategy A** — in-memory patch. Applied and verified. All three triggers re-enabled.

**Phase 2 (next): Decouple ingestion from processing** — redesign so the link processor is source-agnostic. External sources (Telegram, API) should commit events via LiveStore and return immediately. The processor reacts to state changes. Notifications (Telegram reactions) are a separate concern driven by processing result events.

**Phase 3 (when needed): + R2 Snapshot** — bound cold start when eventlog reaches ~5k-10k events.

**Deprioritized: Cloudflare Queues** — originally Phase 2, but after Effect layers fixed per-step timeouts/retries and all app-level bugs were resolved, Queues solve a scaling problem we don't have. Revisit if link volume outgrows sequential processing.

**Long term: Strategy B** (eliminate LiveStore from processor) is the ideal end state but requires significant architecture work not justified at current scale.

## VFS Architecture Diagrams

```
BEFORE (current — CloudflareSqlVFS):
  wasm SQLite → CloudflareSqlVFS → ctx.storage.sql.exec()     → 114k rows_written/day
                  jWrite() per page    INSERT INTO vfs_blocks
                  64 KiB blocks        (2-6 rows_written each)

PHASE 1 (in-memory patch — MemoryVFS):
  wasm SQLite → MemoryVFS → JS heap memory (ArrayBuffers)     → 0 rows_written
                               lost on DO eviction

PHASE 2 (+ R2 snapshot):
  wasm SQLite → MemoryVFS → JS heap memory                    → 0 rows_written
                               ↕ serialize/deserialize
                               R2 object (snapshot blob)      → 2 R2 ops/cycle
```

**What changes:** Only the storage layer underneath wasm SQLite. The wasm SQLite binary, session extension, materializer, all livestore sync logic — unchanged. `MemoryVFS` stores SQLite pages as `ArrayBuffer`s in JS heap instead of writing 64 KiB BLOBs to native DO SqlStorage.

**What stays the same:**

- wa-sqlite with session/preupdate/bytecode extensions (same binary)
- `sqlite3.serialize()` / `sqlite3.deserialize()` (work on in-memory DBs)
- `store.commit()` → pushes events to SyncBackendDO via RPC
- `store.query()` → reads from in-memory materialized state
- `livePull` → pulls events from SyncBackendDO into in-memory eventlog
- Session-based changeset tracking → same wasm, just MemoryVFS instead of CloudflareSqlVFS

## LiveStore Sync Guarantees

Verified 2026-02-27, source: `readonly-llm-lookup/livestore/`.

`createStoreDoPromise` (what LinkProcessorDO calls) is a blocking sync barrier:

```
createStoreDoPromise()
  └─ createStoreDo()
       └─ createStore()
            └─ boot leader thread
                 └─ syncProcessor.boot
                      └─ blockingDeferred: resolves when EITHER
                           ├─ SyncBackendDO returns pageInfo: 'NoMore'
                           │   (all events sent + materialized)
                           └─ OR 500ms timeout fires (whichever first)
```

**Key config** (in `create-store-do.ts` line 120):

```typescript
initialSyncOptions: { _tag: 'Blocking', timeout: 500 }
```

**What this means:**

- **Best case:** All events synced and materialized before 500ms — full guarantee
- **Worst case:** Sync slow, 500ms timeout fires — partial sync, background `livePull` catches up
- With `livePull: true`, it's a streaming subscription — events arriving during pull are included
- After initial pull, background streaming continues reactively

**Delta sync on wakeup:** Persisted `sessionId` enables delta pull — only events since last session. No permanent data loss on eviction.

**Small race window:** Between "initial sync resolves" and "subscription established", a newly committed event could theoretically be missed. In practice mitigated by:

- `ensureSubscribed()` called immediately after `getStore()`
- `livePull` continues streaming in background
- Subscription fires on next reactive update

**Why this doesn't matter for the queue path:** The queue consumer calls the DO, which syncs and then commits `linkCreated` itself. There's no race — the DO creates the event, it doesn't need to discover it via sync. The race only applies to the browser path (SyncBackendDO pokes DO to discover an externally committed link), and there `livePull` streaming + subscriptions handle it.

## R2 Snapshot (Future Idea)

When eventlog reaches ~5k–10k events, cold start becomes expensive (full replay on every wake-up). R2 snapshots would cap this.

```
Without snapshots:                    With R2 snapshots:

DO wakes up                           DO wakes up
    │                                     │
    ▼                                     ▼
livePull: ALL events                  R2 GET: snapshot (~50ms)
(1k events = 100ms)                       │
(10k events = 1-3s)                       ▼
(50k events = 10-30s ⚠️)              deserialize into in-memory DBs
    │                                     │
    ▼                                     ▼
rematerialize ALL                     livePull: DELTA only
    │                                 (events since snapshot)
    ▼                                     │
ready                                     ▼
                                      rematerialize delta
                                          │
                                          ▼
                                      ready

                                      On shutdown:
                                      serialize DBs → R2 PUT
```

### Concept

After Phase 1, every wake-up replays the entire eventlog. Phase 2 adds R2-backed snapshots to bound cold start time:

- **After processing:** serialize all 3 in-memory DBs → single R2 object
- **On wake-up:** R2 GET → deserialize into in-memory DBs → delta sync only

### Prerequisites

- R2 bucket binding in `wrangler.toml` for LinkProcessorDO
- Access to `sqlite3.serialize()` / `sqlite3.deserialize()` in the adapter (already available via wa-sqlite)

### Snapshot format (proposed)

Single R2 object per org, key: `snapshots/{storeId}/livestore.bin`

```
[4 bytes: stateDb length][stateDb serialized bytes]
[4 bytes: eventlogDb length][eventlogDb serialized bytes]
[4 bytes: syncDb length][syncDb serialized bytes]
```

### Implementation sketch

Requires a second patch to `make-adapter.ts` (or a wrapper in `durable-object.ts`):

```typescript
// In LinkProcessorDO, before creating the store:
const snapshotKey = `snapshots/${storeId}/livestore.bin`;
const snapshot = await env.SNAPSHOT_BUCKET.get(snapshotKey);

// After creating the store and processing:
const stateBytes = sqlite3.serialize(dbState.pointer, "main");
const eventlogBytes = sqlite3.serialize(dbEventlog.pointer, "main");
const syncBytes = sqlite3.serialize(syncInMemoryDb.pointer, "main");
const blob = packSnapshot(stateBytes, eventlogBytes, syncBytes);
await env.SNAPSHOT_BUCKET.put(snapshotKey, blob);
```

### Open questions

- **Hook point:** Where in `make-adapter.ts` to deserialize before `livePull` starts? Need to deserialize between DB creation (step 5-6) and `makeLeaderThreadLayer()` (step 7). May need the patch to expose a callback or accept pre-populated DBs.
- **Staleness:** If the snapshot is very old, delta sync pulls many events. Need to measure if this is still faster than full replay.
- **Snapshot invalidation:** When schema migrations change the state DB format, old snapshots become invalid. Need to include schema hash in the R2 key or snapshot header.

## Precise Materialized State Dependencies

The document previously noted that only `store.query(tables.tags)` needs materialized state. That's incomplete — the DO uses materialized state in **4 places**:

### In `durable-object.ts`:

| Usage                                      | Line    | Purpose                                                                                                              | Needed?                                                                                      |
| ------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pendingLinks$` subscription               | 113-133 | Reactive processing: watches `tables.links` + `tables.linkProcessingStatus`, fires when new unprocessed links appear | **Only if subscription-based.** Could be replaced by explicit triggering from SyncBackendDO. |
| `store.query(tables.linkProcessingStatus)` | 145-147 | Checks if link is a retry                                                                                            | **Only if subscription-based.** The caller (SyncBackendDO) could pass this info.             |
| `store.query(tables.links.where({ url }))` | 221     | Duplicate detection during ingest                                                                                    | **Could be replaced** by querying eventlog for `v1.LinkCreated` with matching URL.           |

### In `process-link.ts`:

| Usage                      | Line | Purpose                                                              | Needed?                                                                                                    |
| -------------------------- | ---- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `store.query(tables.tags)` | 81   | AI tag matching — fuzzy-matches AI suggestions against existing tags | **Only when AI enabled.** The only usage that truly needs materialized state AND can't easily be replaced. |

### Key insight

The **subscription architecture** drives 3 of 4 materialized state dependencies. If the DO were triggered explicitly (SyncBackendDO passes `{ linkId, url, storeId }` on push), only the tag query remains — and only when AI is enabled.

However, even with explicit triggering, the in-memory LiveStore client still pulls and materializes the full eventlog on startup. Passing tags externally doesn't save cold start time because livestore doesn't support "pull just enough for seq numbers."

## Trade-off Analysis: In-Memory Approach

The in-memory patch solves `rows_written` but shifts costs elsewhere.

### Cold start — paid on EVERY wake-up

LinkProcessorDO is bursty: wake up → process 1 link → idle → evicted. Each wake-up re-pulls and re-materializes the **entire** eventlog from SyncBackendDO. This is not a one-time cost.

**Measured:** ~120ms cold start at current eventlog size (local, 2026-02-12). Store creation → subscription fired.

| Links saved | ~Events    | Est. cold start       | Verdict                  |
| ----------- | ---------- | --------------------- | ------------------------ |
| current     | small      | **~120ms** (measured) | Fine                     |
| 1,000       | ~3k–6k     | ~200–500ms            | Fine                     |
| 5,000       | ~15k–30k   | ~1–3s                 | Acceptable               |
| 10,000      | ~30k–60k   | ~3–10s                | Getting tight            |
| 50,000      | ~150k–300k | ~10–30s               | Hitting 30s DO CPU limit |

The eventlog is append-only — livestore has no compaction or snapshotting. Growth is monotonic. R2 snapshots (Phase 2) will bound cold start to R2 GET + delta replay instead of full eventlog.

### RAM — 128MB DO limit

All 3 wasm SQLite databases (state, eventlog, sync) live in heap memory simultaneously.

| Links   | Events   | Est. memory (eventlog + state DBs) |
| ------- | -------- | ---------------------------------- |
| 1,000   | ~3k–6k   | ~2–10 MB                           |
| 10,000  | ~30k–60k | ~20–80 MB                          |
| 25,000+ | ~75k+    | Approaching 128MB danger zone      |

Event payloads include URLs, titles, summaries, tag names — memory scales with richness, not just count.

### Network — full eventlog pull on every wake-up

Each rematerialization pulls the full eventlog from SyncBackendDO via RPC. Internal DO-to-DO traffic (free), but latency scales with eventlog size.

### Verdict

**Works well for a personal app with <5k links.** That's months to years of headroom. Cold start, RAM, and network costs all grow linearly — R2 snapshots (Phase 2) will mitigate cold start when eventlog reaches ~5k–10k events.

## Triggers — Re-enabled ✅

All three triggers are active in code as of 2026-02-27 (previously disabled 2026-02-12, re-enabled after in-memory patch):

| Trigger    | File                                         | Status                                                               |
| ---------- | -------------------------------------------- | -------------------------------------------------------------------- |
| onPush     | `src/cf-worker/sync/index.ts:24-37`          | Active — checks for `v1.LinkCreated`, calls `triggerLinkProcessor()` |
| Ingest API | `src/cf-worker/ingest/service.ts:79-90`      | Active — fetches `LINK_PROCESSOR_DO` stub                            |
| Telegram   | `src/cf-worker/telegram/handlers.ts:124-161` | Active — `ingestUrl()` calls DO to process links                     |

## Verification Progress (Option 1: In-Memory DO)

Source code verified on 2026-02-12:

- [x] **`livePull` bootstraps an empty store** — Empty eventlog → `dbEventlogMissing = true` → triggers initial pull from SyncBackendDO → `rematerializeFromEventlog()` rebuilds state from fetched events. Zero events = zero chunks processed, no special case needed.
- [x] **`session()` works in MemoryVFS** — Same wa-sqlite binary (forked with session extension). MemoryVFS just changes storage backend (heap vs `vfs_blocks`). `serialize()`/`deserialize()` also work on in-memory DBs.
- [x] **Measure cold start time** — ~120ms at current eventlog size (store creation → subscription fired). See Evidence 8 for before/after comparison.
- [x] **Test the patch locally** — Patch applied and verified: `totalRowsWritten: 0`, `rowsWritten: 0`. All events push to SyncBackendDO and broadcast normally. See Evidence 8.

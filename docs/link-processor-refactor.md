# LinkProcessorDO — VFS Write Amplification

## Problem Statement

LinkProcessorDO hit **114,161 rows_written on Feb 11** (~99.9% of all DO writes), exceeding the free tier 100k/day limit. SyncBackendDO wrote only **141 rows** the same day.

## Root Cause: VFS Write Amplification

LinkProcessorDO runs a full livestore client using **wasm SQLite + CloudflareSqlVFS**. Every `store.commit()` triggers multiple VFS block writes to native DO SqlStorage, each costing 2-6 `rows_written` (row + index updates).

### Measured costs (local, 2026-02-12)

Instrumented `ctx.storage.sql.exec()` via `SqlStorageCursor.rowsWritten`:

| Metric                                  | Before patch       | After patch (in-memory) |
| --------------------------------------- | ------------------ | ----------------------- |
| DO initialization (store + livePull)    | **3,772**          | **0**                   |
| Per-link processing (AI + 2 tags)       | **854**            | **0**                   |
| Total DO lifecycle (init + 1 link)      | **4,626**          | **0**                   |
| Per commit (~6 commits)                 | **~142**           | **0**                   |

At 100k/day limit, the VFS path supported only ~21-117 links/day depending on cold starts.

### Write path

Each wasm SQLite page write → `jWrite()` → `BlockManager.writeBlocks()` → `INSERT OR REPLACE INTO vfs_blocks` (64 KiB BLOB). No buffering, no deduplication. `jSync()` is a no-op (native DO SQL provides immediate durability).

Per link with AI enabled: **6 commits × ~142 rows_written = ~854 rows_written**.

### Commits per link

| Scenario                      | Commits | Events                                                                      |
| ----------------------------- | ------- | --------------------------------------------------------------------------- |
| No AI, metadata succeeds      | **3**   | `linkProcessingStarted` + `linkMetadataFetched` + `linkProcessingCompleted` |
| No AI, metadata fails         | **2**   | `linkProcessingStarted` + `linkProcessingCompleted`                         |
| AI enabled, 3 tag suggestions | **6**   | + `linkSummarized` + 3× `tagSuggested`                                      |
| Error                         | **2**   | `linkProcessingStarted` + `linkProcessingFailed`                            |

## Why Livestore Uses Wasm SQLite (Not Native DO SQLite)

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

CF's native `ctx.storage.sql` cannot replace wasm SQLite — it lacks 5 capabilities:

| Capability                                                                      | Used for                                                                 | CF native SQL                 |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------- |
| **Session extension** (`session_create`, `changeset_invert`, `changeset_apply`) | Rebase/rollback — core sync mechanism                                    | Not available                 |
| **Serialize / Export** (`sqlite3.serialize()`)                                  | State snapshots for sync, devtools                                       | Not available                 |
| **Deserialize + Backup** (`sqlite3.deserialize()`, `sqlite3.backup()`)          | Restoring state from snapshots, `syncInMemoryDb.import(initialSnapshot)` | Not available                 |
| **Multiple independent databases**                                              | State db + eventlog db + sync in-memory db (3 separate files via VFS)    | Not available (1 DB per DO)   |
| **Low-level statement API** (`prepare`, `step`, `bind`, `column`)               | Fine-grained query control, column type handling                         | Not available (only `exec()`) |

The session extension is the **most critical** blocker — it's the foundation of livestore's optimistic concurrency model.

## Solution: In-Memory DBs + R2 Snapshots

### Architecture (after Phase 1 + 2)

```
BEFORE (CloudflareSqlVFS):
  wasm SQLite → CloudflareSqlVFS → ctx.storage.sql.exec()     → 114k rows_written/day
                  jWrite() per page    INSERT INTO vfs_blocks
                  64 KiB blocks        (2-6 rows_written each)

AFTER (MemoryVFS + R2 snapshot):
  wasm SQLite → MemoryVFS → JS heap memory                    → 0 rows_written
                               ↕ serialize/deserialize
                               R2 object (snapshot blob)      → 2 R2 ops/cycle
```

Only the storage layer underneath wasm SQLite changes. The wasm binary, session extension, materializer, all livestore sync logic — unchanged.

### Options considered

| Option                         | Why ruled out                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Native DO SQLite adapter**   | CF lacks session extension — empty stubs → silent data corruption on rebase                                          |
| **R2 as VFS backend**          | R2 API is async (VFS requires sync), write amplification unchanged, 100x latency. R2 as snapshot store is viable.    |
| **D1 as storage**              | Same 100k rows_written/day limit on free tier                                                                        |
| **Raw SQL event injection**    | No built-in server-side push API. Manual seqNum + broadcast = coupled to livestore internals                         |

### Strategy comparison

|                     | rows_written  | Cold start                            | RAM growth                        | R2 ops  | Effort | Horizon      |
| ------------------- | ------------- | ------------------------------------- | --------------------------------- | ------- | ------ | ------------ |
| **A: In-Memory**    | 0 (processor) | Grows with eventlog                   | Grows with eventlog               | 0       | Low    | Months–years |
| **A + R2 Snapshot** | 0 (processor) | R2 GET + delta (~50ms + small replay) | Same at peak, bounded by snapshot | 2/cycle | Medium | Years        |
| **B: No LiveStore** | 0 (processor) | None                                  | Minimal                           | 0       | High   | Permanent    |

**Implemented: Strategy A + R2 Snapshot.** Strategy B (eliminate livestore from processor entirely) is the ideal long-term end state but requires significant architecture work not justified at current scale.

## Trade-off Analysis

The in-memory patch solves `rows_written` but shifts costs to cold start and RAM.

### Cold start — paid on every wake-up (mitigated by R2 snapshots)

| Links saved | ~Events    | Without snapshot      | With snapshot         |
| ----------- | ---------- | --------------------- | --------------------- |
| current     | small      | **~120ms** (measured) | **~108ms** (measured) |
| 1,000       | ~3k–6k     | ~200–500ms            | ~50ms + small delta   |
| 5,000       | ~15k–30k   | ~1–3s                 | ~50ms + small delta   |
| 10,000      | ~30k–60k   | ~3–10s                | ~50ms + small delta   |

### RAM — 128MB DO limit

| Links   | Events   | Est. memory (eventlog + state DBs) |
| ------- | -------- | ---------------------------------- |
| 1,000   | ~3k–6k   | ~2–10 MB                           |
| 10,000  | ~30k–60k | ~20–80 MB                          |
| 25,000+ | ~75k+    | Approaching 128MB danger zone      |

**Verdict:** Works well for a personal app with <5k links. That's months to years of headroom.

## Materialized State Dependencies

The DO uses materialized state in 4 places:

| Usage                                      | Location            | Purpose                                       |
| ------------------------------------------ | ------------------- | --------------------------------------------- |
| `pendingLinks$` subscription               | `durable-object.ts` | Reactive processing — fires on new links      |
| `store.query(tables.linkProcessingStatus)` | `durable-object.ts` | Checks if link is a retry                     |
| `store.query(tables.links.where({ url }))` | `durable-object.ts` | Duplicate detection during ingest             |
| `store.query(tables.tags)`                 | `process-link.ts`   | AI tag matching — only when AI enabled        |

The subscription architecture drives 3 of 4 dependencies. The tag query is the only one that truly needs materialized state and can't easily be replaced.

## Implementation

### Phase 1: In-Memory Patch (done, 2026-02-12)

Package: `@livestore/adapter-cloudflare@0.4.0-dev.22`

Patch switches `dbState` and `dbEventlog` from `_tag: 'storage'` (CloudflareSqlVFS) to `_tag: 'in-memory'` (MemoryVFS). Patched files: `src/make-adapter.ts`, `dist/make-adapter.js`.

```diff
- const dbState = yield* makeSqliteDb({ _tag: 'storage', storage, fileName: stateDbFileName, ... })
+ const dbState = yield* makeSqliteDb({ _tag: 'in-memory', configureDb: () => {} })

- const dbEventlog = yield* makeSqliteDb({ _tag: 'storage', storage, fileName: eventlogDbFileName, ... })
+ const dbEventlog = yield* makeSqliteDb({ _tag: 'in-memory', configureDb: () => {} })
```

`rows_written` instrumentation in the DO constructor (`SqlStorageCursor.rowsWritten`) stays as a production monitoring guard.

### Phase 2: R2 Snapshot (done, 2026-02-12)

#### Concept

R2-backed snapshots bound cold start time. Instead of replaying the full eventlog on every wake-up, restore from a snapshot and only replay the delta.

#### R2 Privacy

R2 buckets are **private by default** — no public URLs unless explicitly enabled. The `SNAPSHOT_BUCKET` binding is only accessible from Worker code. Objects are AES-256 encrypted at rest. No S3 API tokens needed.

#### Snapshot format

Only 2 DBs needed — `syncInMemoryDb` is derived from `dbState.export()` at startup.

Single R2 object per org, key: `snapshots/{storeId}/{schemaHash}.bin`

Schema hash changes when state tables/materializers change, so old snapshots are automatically ignored after schema migrations.

```
[4 bytes: stateDb length][stateDb serialized bytes]
[4 bytes: eventlogDb length][eventlogDb serialized bytes]
```

Pack/unpack utilities in `src/cf-worker/link-processor/snapshot.ts`.

#### Adapter patch (extended)

The patch was extended with two new parameters threaded through `createStoreDoPromise` → `makeAdapter`:

| Parameter       | Type                                          | Purpose                                                                                                                |
| --------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `snapshotData`  | `{ state: Uint8Array; eventlog: Uint8Array }` | Imported into `dbState` and `dbEventlog` after creation, before `makeLeaderThreadLayer`. Non-empty DBs → delta sync.   |
| `onExportReady` | `(fns: { exportState, exportEventlog }) => void` | Called after store init with closures that export current DB state. Used to save snapshots after processing. |

Patched files: `src/make-adapter.ts`, `dist/make-adapter.js`, `src/create-store-do.ts`, `dist/create-store-do.js`, `dist/create-store-do.d.ts`.

#### Hook point

Snapshot import happens between DB creation and `makeLeaderThreadLayer`. `makeLeaderThreadLayer` checks `sqlite_master` count — non-empty DBs trigger delta sync instead of full pull.

```
dbState = makeSqliteDb({ _tag: 'in-memory' })
dbEventlog = makeSqliteDb({ _tag: 'in-memory' })
← snapshotData import here (dbState.import + dbEventlog.import)
makeLeaderThreadLayer({ dbState, dbEventlog, ... })  // detects non-empty → delta sync
```

#### DO lifecycle with snapshots

```
1. DO wakes up (fetch or syncUpdateRpc)
2. getStore() → loadSnapshot() → R2 GET
3. createStoreDoPromise({ snapshotData, onExportReady })
4. Adapter: dbState.import(snapshot.state), dbEventlog.import(snapshot.eventlog)
5. makeLeaderThreadLayer: sqlite_master count > 0 → delta sync
6. livePull: only fetch events since snapshot
7. Subscription fires → process pending links
8. After each link: saveSnapshot() → R2 PUT
9. DO idles → eventually evicted → state lost → rebuilt from R2 snapshot on next wake-up
```

#### Error handling

- **R2 GET failure:** Logged as warning, falls back to full eventlog pull (same as Phase 1)
- **R2 PUT failure:** Logged as warning, processing continues — next wake-up will do full pull
- Both R2 operations wrapped in try/catch to never block link processing

#### Stuck link recovery

Links stuck in `pending` status for longer than 5 minutes (e.g., DO evicted mid-processing) are automatically failed with `error: "stuck_timeout"`. A safety net in `processLinkAsync` also emits `LinkProcessingFailed` if any error escapes the Effect pipeline.

#### Checklist

- [x] Add R2 bucket binding to `wrangler.toml` (prod + staging)
- [x] Add `SNAPSHOT_BUCKET: R2Bucket` to Env type
- [x] Implement `packSnapshot()` / `unpackSnapshot()` (`snapshot.ts`)
- [x] Extend adapter patch with `snapshotData` + `onExportReady` (src, dist, d.ts)
- [x] Add snapshot restore logic to `LinkProcessorDO.getStore()`
- [x] Add snapshot save logic after `processLinkAsync` completes
- [x] Include schema hash in R2 key for migration safety
- [x] Verify `livePull` delta sync after snapshot restore (local — eventlog grew 53248 → 57344 bytes)
- [x] Re-enable all triggers (onPush, ingest API, Telegram)
- [x] Stuck link timeout + safety net error handling
- [ ] Verify in production via `do-metrics.sh` + R2 dashboard (needs deploy)

## Future: Strategy B — Eliminate LiveStore from Processor

Replace the full livestore client with:

1. **Tag query via SyncBackendDO RPC** — add `getTags(storeId)` method that queries native SQLite eventlog for tag events, reduces in memory
2. **Event emission via SyncBackendDO Push RPC** — construct valid event payloads and push through existing sync protocol

LinkProcessorDO becomes a simple stateless DO — no wasm SQLite, no VFS, no materializer, no cold start, minimal RAM.

**Unsolved:** How to construct valid livestore events (seq numbers, clientId, sessionId, sync metadata) without a livestore client.

**Effort:** High. **Horizon:** When current approach hits scaling limits.

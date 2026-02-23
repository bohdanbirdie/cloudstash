# LinkProcessorDO — VFS Write Amplification

## Problem Statement

LinkProcessorDO hit **114,161 rows_written on Feb 11** (~99.9% of all DO writes), exceeding the free tier 100k/day limit. SyncBackendDO wrote only **141 rows** the same day.

**All three triggers are currently disabled** (onPush, ingest API, Telegram). Link processing is offline.

## Evidence: What We Know For Sure

### 1. LinkProcessorDO is the culprit (MEASURED)

CF GraphQL `durableObjectsPeriodicGroups` dataset, queried via `scripts/do-metrics.sh`:

| Namespace                                          | Feb 11 rows_written |
| -------------------------------------------------- | ------------------- |
| LinkProcessorDO (`0cc85e49...`, wasm SQLite + VFS) | **114,161**         |
| SyncBackendDO (`e96f6022...`, native SQLite)       | **141**             |

### 2. VFS write path is unbuffered (SOURCE CODE VERIFIED)

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

Each `sql.exec()` = 1 native DO SqlStorage write. But `rows_written` cost is **higher than 1** — see section 5.

**`jSync()` is a no-op** (`CloudflareSqlVFS.ts:340-347`):

```typescript
jSync(fileId: number, _flags: number): number {
  // SQL storage provides immediate durability, so sync is effectively a no-op
  return VFS.SQLITE_OK
}
```

### 3. Each store.commit() costs 3+ native writes minimum (SOURCE CODE VERIFIED)

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

### 4. VFS stores data as 64 KiB blocks (SOURCE CODE VERIFIED)

`CloudflareSqlVFS.ts:9`: `const BLOCK_SIZE = 64 * 1024`

Tables created in native DO SqlStorage:

```sql
CREATE TABLE vfs_files (file_path TEXT PRIMARY KEY, file_size INTEGER, ...)
CREATE TABLE vfs_blocks (file_path TEXT, block_id INTEGER, block_data BLOB, PRIMARY KEY (file_path, block_id))
```

Plus indices: `idx_vfs_blocks_range`, `idx_vfs_files_modified`, and a trigger `trg_vfs_files_update_modified`.

### 5. Each VFS block write costs 2-4 rows_written (CF DOCS + SOURCE CODE)

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

### 6. SqlStorageCursor.rowsWritten can measure actual cost (CF DOCS)

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

### 7. Measured baseline via SqlStorageCursor.rowsWritten (LOCAL, 2026-02-12)

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

### 8. After Phase 1 patch: zero rows_written (LOCAL, 2026-02-12)

Applied `bun patch` switching `_tag: 'storage'` → `_tag: 'in-memory'` for `dbState` and `dbEventlog` in `@livestore/adapter-cloudflare`. Same test: single link, AI enabled, 6 commits.

| Metric                            | Before patch       | After patch |
| --------------------------------- | ------------------ | ----------- |
| DO initialization                 | 3,772 rows_written | **0**       |
| Per-link processing (AI + 2 tags) | 854 rows_written   | **0**       |
| Total DO lifecycle                | 4,626 rows_written | **0**       |

All events still push to SyncBackendDO via RPC and broadcast to WebSocket clients normally. Link processing flow unchanged — metadata fetched, AI summary generated, tag suggestions emitted, processing completed.

## Why Livestore Uses Wasm SQLite (Not Native DO SQLite)

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

## What We Assume (Needs Verification)

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

## Options Analysis

### Key Insight

Livestore is designed for **client-side** state management. Server-side clients are supported via `@livestore/adapter-node` (long-lived processes with persistent state), but not as serverless functions. CF free tier + VFS write amplification = wrong fit for running a full livestore client.

The only reason LinkProcessorDO needs materialized state is `store.query(tables.tags)` — for AI tag matching. Without that, no materializer is needed.

### Ruled Out

| Option                         | Why                                                                                                                                                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Native DO SQLite adapter**   | CF lacks 5 capabilities livestore needs: session extension, serialize, deserialize+backup, multiple DBs, low-level statement API. Session is the critical one — empty stubs → silent data corruption on rebase.                                                                 |
| **Custom changeset tracking**  | Livestore's `makeChangeset(blob).invert().apply()` expects SQLite's native binary changeset format. No way to produce compatible blobs without the session extension.                                                                                                           |
| **R2 as VFS backend**          | R2 API is async (VFS requires sync). Write amplification unchanged (same block writes, just to R2). R2 Class A ops ~33k/day — same ballpark as DO rows_written. Latency 100x worse (~50ms vs ~0.1ms per op). **R2 as snapshot store is viable** — see Strategy A + R2 Snapshot. |
| **D1 as storage**              | Same 100k rows_written/day limit on free tier.                                                                                                                                                                                                                                  |
| **Raw SQL event injection**    | No built-in server-side push API. Manual seqNum + broadcast = coupled to livestore internals.                                                                                                                                                                                   |
| **Regular CF Worker (not DO)** | Workers are stateless, 10ms CPU. Can't persist wasm SQLite or maintain WebSocket.                                                                                                                                                                                               |

### Viable — Ordered by Practicality

#### Option 1: In-Memory LiveStore in DO (patch adapter) ★ RECOMMENDED

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

**Implementation:** Patch `make-adapter.ts` via `bun patch`:

```diff
- const dbState = yield* makeSqliteDb({ _tag: 'storage', storage, fileName: stateDbFileName, ... })
- const dbEventlog = yield* makeSqliteDb({ _tag: 'storage', storage, fileName: eventlogDbFileName, ... })
+ const dbState = yield* makeSqliteDb({ _tag: 'in-memory', storage, configureDb: () => {} })
+ const dbEventlog = yield* makeSqliteDb({ _tag: 'in-memory', storage, configureDb: () => {} })
```

- **Complexity:** Low — small patch to `make-adapter.ts`
- **Risk:** Low-Medium — session() works in wasm MemoryVFS (full wa-sqlite with extensions). Cold start adds latency but fits in CPU budget. Need to verify `livePull` correctly bootstraps an empty store.
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

## Disabled Triggers

All three disabled since 2026-02-12:

| Trigger    | File                                         | How Disabled                        | Current UX                               |
| ---------- | -------------------------------------------- | ----------------------------------- | ---------------------------------------- |
| onPush     | `src/cf-worker/sync/index.ts:18-57`          | Code commented out                  | Silent — links sync but aren't processed |
| Ingest API | `src/cf-worker/ingest/service.ts:79-112`     | Code commented, returns error       | HTTP error: "temporarily disabled"       |
| Telegram   | `src/cf-worker/telegram/handlers.ts:124-142` | Stub returns `{ status: "failed" }` | Bot shows error message, no retry        |

## Verification Progress (Option 1: In-Memory DO)

Source code verified on 2026-02-12:

- [x] **`livePull` bootstraps an empty store** — Empty eventlog → `dbEventlogMissing = true` → triggers initial pull from SyncBackendDO → `rematerializeFromEventlog()` rebuilds state from fetched events. Zero events = zero chunks processed, no special case needed.
- [x] **`session()` works in MemoryVFS** — Same wa-sqlite binary (forked with session extension). MemoryVFS just changes storage backend (heap vs `vfs_blocks`). `serialize()`/`deserialize()` also work on in-memory DBs.
- [x] **Measure cold start time** — ~120ms at current eventlog size (store creation → subscription fired). See section 8 for before/after comparison.
- [x] **Test the patch locally** — Patch applied and verified: `totalRowsWritten: 0`, `rowsWritten: 0`. All events push to SyncBackendDO and broadcast normally. See section 8.

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

## Refined Options

### The fundamental tension

Server-side link processing needs:

1. **Event emission** — commit events with correct seq numbers, push to SyncBackendDO
2. **Tag query** — read current tags for AI matching (only when AI enabled)

Livestore provides both, but at the cost of a full client: wasm SQLite, eventlog replay, materialized state. On the VFS path this costs 114k `rows_written/day`. On the in-memory path it costs cold start + RAM that grow linearly.

### Strategy A: Accept growth, mitigate later ★ RECOMMENDED FOR NOW

**In-Memory LiveStore patch (original Option 1).**

- Patch `make-adapter.ts` to use `_tag: 'in-memory'` for `dbState` and `dbEventlog`
- Zero `rows_written` from LinkProcessorDO
- Cold start + RAM acceptable at current scale (<1k links)
- Revisit when eventlog approaches ~10k events

**Effort:** Low — small `bun patch`
**Risk:** Low — verified in source, same wa-sqlite binary
**Horizon:** Months to years at personal app scale

### Strategy A + R2 Snapshot: Bounded cold start ★ PHASE 2

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

**Why R2, not DO storage?**

- DO `ctx.storage.put()` has a **128 KiB max** per value — too small for a serialized DB with summaries and metadata
- R2 allows up to **5 GB per object**, handles any realistic snapshot size
- R2 free tier: 1M Class A ops/month (~33k/day) — 2 ops per processing cycle is negligible
- R2 latency (~50ms) is acceptable for a background processor

**Why not R2 as VFS backend?**

- R2 API is **async** — VFS needs sync I/O (`jRead`/`jWrite` are synchronous)
- Write amplification unchanged — still 9-30 block writes per link, just to R2 instead of DO SQL
- R2 Class A ops (~33k/day) in same ballpark as DO rows_written (~16k-50k effective ops/day) — no clear win
- Latency: ~10-50ms per R2 op vs ~0.1ms for colocated DO SQL — would make processing 100x slower

**Cost model:**

|                                | Phase 1 (in-memory only)              | Phase 2 (+ R2 snapshot)           |
| ------------------------------ | ------------------------------------- | --------------------------------- |
| rows_written (LinkProcessorDO) | 0                                     | 0                                 |
| Cold start                     | Full eventlog replay (grows linearly) | R2 GET + delta replay (bounded)   |
| RAM                            | Full eventlog + state in heap         | Same (snapshot loads into memory) |
| R2 ops/cycle                   | 0                                     | 2 (GET + PUT)                     |
| R2 storage                     | 0                                     | ~50 KiB–5 MB per org              |

**Open question:** Can we hook snapshot restore into livestore's initialization flow? The pieces exist:

- `sqlite3.deserialize()` works on in-memory DBs (verified in source)
- `sessionId` persisted in DO storage enables delta pulls
- `livePull` pulls only events newer than what the client has seen

But the `make-adapter.ts` code creates fresh in-memory DBs, then runs `livePull`. We'd need to **deserialize the snapshot into the DBs between creation and sync**. This likely requires a second patch to `make-adapter.ts` or a hook in `createStoreDoPromise`. Needs investigation when Phase 2 becomes necessary.

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

### Summary

|                     | rows_written  | Cold start                            | RAM growth                        | R2 ops  | Effort | Horizon      |
| ------------------- | ------------- | ------------------------------------- | --------------------------------- | ------- | ------ | ------------ |
| **A: In-Memory**    | 0 (processor) | Grows with eventlog                   | Grows with eventlog               | 0       | Low    | Months–years |
| **A + R2 Snapshot** | 0 (processor) | R2 GET + delta (~50ms + small replay) | Same at peak, bounded by snapshot | 2/cycle | Medium | Years        |
| **B: No LiveStore** | 0 (processor) | None                                  | Minimal                           | 0       | High   | Permanent    |
| **C: Client tags**  | 0 (processor) | Same as A                             | Same as A                         | 0       | Medium | Same as A    |

### Recommendation

**Phase 1: Strategy A** (in-memory patch). Low effort, verified to work, buys significant runway at current scale.

**Phase 2: Strategy A + R2 Snapshot** when eventlog reaches ~5k–10k events. Bounds cold start to R2 GET + delta replay instead of full eventlog. Requires R2 binding + serialize/deserialize logic + adapter patch.

**Long term: Strategy B** is the ideal end state but requires significant architecture work not justified at current scale.

## VFS Architecture: Before and After

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

## Disabled Triggers

Re-enable after implementing Phase 1.

## Implementation Details

### Phase 1: In-Memory Patch

#### What to patch

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

#### What happens at runtime after the patch

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

#### Re-enable triggers after verification

Three files need uncommenting (all currently have `TODO: re-enable` markers):

1. **`src/cf-worker/sync/index.ts:18-57`** — onPush hook in SyncBackendDO
2. **`src/cf-worker/ingest/service.ts:79-112`** — Ingest API DO fetch
3. **`src/cf-worker/telegram/handlers.ts:124-142`** — Telegram ingest function

### Phase 2: R2 Snapshot (when eventlog reaches ~5k–10k events)

#### Concept

After Phase 1, every wake-up replays the entire eventlog. Phase 2 adds R2-backed snapshots to bound cold start time:

- **After processing:** serialize all 3 in-memory DBs → single R2 object
- **On wake-up:** R2 GET → deserialize into in-memory DBs → delta sync only

#### Prerequisites

- R2 bucket binding in `wrangler.toml` for LinkProcessorDO
- Access to `sqlite3.serialize()` / `sqlite3.deserialize()` in the adapter (already available via wa-sqlite)

#### Snapshot format (proposed)

Single R2 object per org, key: `snapshots/{storeId}/livestore.bin`

```
[4 bytes: stateDb length][stateDb serialized bytes]
[4 bytes: eventlogDb length][eventlogDb serialized bytes]
[4 bytes: syncDb length][syncDb serialized bytes]
```

#### Implementation sketch

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

#### Open questions for Phase 2

- **Hook point:** Where in `make-adapter.ts` to deserialize before `livePull` starts? Need to deserialize between DB creation (step 5-6) and `makeLeaderThreadLayer()` (step 7). May need the patch to expose a callback or accept pre-populated DBs.
- **Staleness:** If the snapshot is very old, delta sync pulls many events. Need to measure if this is still faster than full replay.
- **Snapshot invalidation:** When schema migrations change the state DB format, old snapshots become invalid. Need to include schema hash in the R2 key or snapshot header.

#### Checklist

- [ ] Add R2 bucket binding to `wrangler.toml`
- [ ] Implement `packSnapshot()` / `unpackSnapshot()` — serialize 3 DBs into one blob
- [ ] Patch `make-adapter.ts` to accept optional pre-populated DB bytes
- [ ] Add snapshot restore logic to `LinkProcessorDO.getStore()`
- [ ] Add snapshot save logic after processing completes
- [ ] Include schema hash in snapshot key for migration safety
- [ ] Verify `livePull` delta sync works correctly after snapshot restore
- [ ] Optionally combine with Option 5 (reduce events per link) for fewer SyncBackendDO writes
- [ ] Evaluate Strategy B if R2 snapshot proves insufficient

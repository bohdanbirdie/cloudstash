# DO KV Snapshots

Implemented 2026-03-04. Solves cold start full-replay and VFS write amplification for LinkProcessorDO.

## Problem

LinkProcessorDO uses livestore with in-memory wasm SQLite. Every cold start (after DO eviction ~70-140s idle) requires full eventlog replay via sync from SyncBackendDO. With ~1400+ events:

1. **Initial sync timeout**: Default 500ms (patched to 30s) isn't reliable for large eventlogs
2. **Mailbox registration**: The `@livestore/sync-cf` live pull mailbox is only registered AFTER initial pull completes all pages. If the blocking timeout fires first, `syncUpdateRpc` calls hit "No mailbox found" and updates are silently dropped. Push fails with ServerAheadError, events committed locally are lost when DO evicts.
3. **VFS not viable**: CloudflareSqlVFS writes ~14k `rows_written` per link (100k/day free tier limit). Also causes materializer crashes (UNIQUE constraint on eventlog, WASM changeset function signature mismatch).

## Solution

Export the wasm SQLite databases (state + eventlog) as `Uint8Array` blobs via `sqlite3.serialize()`. Store as 128KB chunks in DO KV storage (`ctx.storage.put`). On cold start, restore from snapshot before creating the store — the eventlog starts pre-populated so sync only needs delta events.

**Cost**: ~6 `rows_written` per snapshot (3 state chunks + 2 eventlog chunks + 1 meta) vs 14k per link with VFS. Confirmed locally.

## Architecture

```
Cold start flow:
  1. loadSnapshot() — ctx.storage.get chunks → reassemble Uint8Array
  2. createStoreDoPromise({ snapshotData: { state, eventlog } })
  3. makeAdapter imports snapshot into dbState + dbEventlog
  4. Eventlog.getClientHeadFromDb() returns snapshot head (e.g., seqNum 1400)
  5. Initial sync pulls only delta (e.g., events 1401-1410) — completes in <1s
  6. Mailbox registered immediately → live pull works

Save points (two):
  1. After store creation in getStore() — bootstraps snapshot on first sync
  2. After each successful link processing in processLinkAsync()

Both call saveSnapshot():
  1. exportState() / exportEventlog() via onExportReady callback
  2. Chunk each Uint8Array into 128KB pieces
  3. Batch write via ctx.storage.put(entries) — atomic
  4. Clean up stale chunks if new snapshot has fewer chunks than old
```

## Changes

### Adapter patch (`@livestore/adapter-cloudflare`)

Added to existing patch (`patches/@livestore%2Fadapter-cloudflare@0.4.0-dev.22.patch`):

**`create-store-do` (src + dist + d.ts):**

- `snapshotData?: { state: Uint8Array; eventlog: Uint8Array }` on `CreateStoreDoOptions`
- `onExportReady?: (fns: { exportState: () => Uint8Array; exportEventlog: () => Uint8Array }) => void`
- Both passed through to `makeAdapter`

**`make-adapter` (src + dist):**

- After creating in-memory `dbState` and `dbEventlog`, import snapshot data if present
- After building leader thread + initial snapshot, call `onExportReady` with export functions

`dbState.export()` returns `Uint8Array` via `sqlite3.serialize()`. `dbState.import(bytes)` uses `sqlite3.deserialize()`. Both methods exist on the SqliteDb object.

### DO changes (`src/cf-worker/link-processor/durable-object.ts`)

- `exportFns` private field — set by `onExportReady` callback
- `loadSnapshot()` — batch-reads chunk keys from KV, reassembles into `Uint8Array` blobs
- `saveSnapshot()` — exports DBs, chunks at 128KB, batch-writes via `ctx.storage.put(entries)`, cleans stale chunks
- `getStore()` — loads snapshot before store creation, saves snapshot after store creation
- `processLinkAsync()` — saves snapshot after successful link processing

Helper functions: `concatUint8Arrays`, `chunkUint8Array`.

## Key files

| File                                                                   | Role                                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/cf-worker/link-processor/durable-object.ts`                       | Snapshot load/save, store creation, processing loop                             |
| `patches/@livestore%2Fadapter-cloudflare@0.4.0-dev.22.patch`           | Adapter changes (snapshot import, export callback, in-memory mode, 30s timeout) |
| `node_modules/@livestore/adapter-cloudflare/dist/make-adapter.js`      | Runtime: snapshot import + onExportReady                                        |
| `node_modules/@livestore/adapter-cloudflare/dist/create-store-do.js`   | Runtime: pass-through options                                                   |
| `node_modules/@livestore/adapter-cloudflare/dist/create-store-do.d.ts` | Types for new options                                                           |

## Why not a KV-backed VFS?

Investigated whether a page-level VFS using `ctx.storage.put` (instead of `ctx.storage.sql`) would be more efficient. **It wouldn't be**, for this workload:

- Full snapshot: ~6 `rows_written` (serialize entire ~800KB DB into ~6 chunks)
- KV VFS: ~20-30 `rows_written` per link (dirty pages + journal writes + metadata)
- The database is small enough that exporting everything is cheaper than tracking individual dirty pages
- Crossover point is ~2.5MB+ databases where page-level writes become competitive
- Livestore already tried and abandoned a KV-backed VFS (`CloudflareWorkerVFS`) due to async reliability issues — no synchronous KV API on DO

## Verification

Confirmed locally (2026-03-04):

1. First boot: no snapshot → full sync → `Snapshot saved { stateChunks: 3, eventlogChunks: 2, estimatedRowsWritten: 6 }`
2. After restart: `Snapshot loaded { stateSize: 319488, eventlogSize: 204800 }` → `Creating store { hasSnapshot: true }` → delta sync only (ServerAheadError shows `providedNum: 372` not 0)
3. Link processing completes normally after restore
4. 275/275 unit tests pass, typecheck clean, lint clean

## Production Result: Reverted

Deployed 2026-03-04, reverted same day. Three issues found:

### 1. First boot timeout (expected but unrecoverable)

The biggest store (~1426 events) had no snapshot on first deploy. Full sync timed out at 30s (`hasSnapshot: false`). The snapshot saved after this timeout captured a partially-synced eventlog with locally-committed but unconfirmed events.

### 2. Concurrent store creation → OOM

Multiple simultaneous requests (SyncBackendDO wake-up, queue message, browser push) all called `getStore()` concurrently. The async `createStoreDoPromise` hadn't returned yet, so `cachedStore` was still `undefined`. Each caller loaded the ~1MB snapshot and created its own wasm SQLite instance. 6 concurrent instances exceeded the 128MB DO memory limit.

**Fix applied (before revert):** Added `storePromise` field to deduplicate concurrent `getStore()` calls — subsequent callers await the same promise.

### 3. Snapshot didn't reduce sync time (root cause for revert)

Even with the snapshot pre-populating the eventlog at seqNum 1380 (only 46-event delta to server at 1426), the initial sync still took exactly 30s (timeout). The sync protocol appears to pull from the beginning regardless of the eventlog content, or the unconfirmed local events in the snapshot confused the protocol's cursor logic.

This meant every cold start with the snapshot was identical to a cold start without it — 30s timeout, mailbox never registered, pushes fail with ServerAheadError, events never sync to browser clients. Links were processed locally but invisible in the UI.

### Open questions for future attempt

1. **Does `Eventlog.getClientHeadFromDb()` use the snapshot's head as the pull cursor?** If not, the snapshot doesn't help sync at all — it only helps materializer replay.
2. **Do unconfirmed events in the snapshot's eventlog confuse the sync protocol?** The snapshot was saved after a timed-out session where events were committed locally but never pushed. The eventlog contains events the server doesn't know about.
3. **Could we snapshot only confirmed state?** The `syncProcessor.syncState` tracks which events are pending vs confirmed, but this isn't accessible from the export callback.
4. **Would the `storePromise` dedup fix alone solve the OOM?** The concurrent creation was a pre-existing race condition in `getStore()` — worth fixing independently of snapshots.

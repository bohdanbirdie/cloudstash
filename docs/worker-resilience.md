# Worker Resilience & Rate Limiting

Mechanisms in place to prevent request storms, CPU exhaustion, and cascade failures on the Cloudflare Workers free tier.

## Background

On 2026-02-09, a cascade failure took down sync for ~1 hour. `auth.api.getSession()` costs ~10ms CPU — right at the Workers free tier 10ms limit. When it intermittently exceeded the limit, the livestore client retried every 1 second indefinitely, creating a storm that overwhelmed D1 and exhausted the daily Durable Objects duration quota.

Full incident log analysis is available in the CF dashboard tail logs.

## Session Cookie Cache

**File:** `src/cf-worker/auth/index.ts`

The most important defense. Better Auth's `session.cookieCache` stores the session in a signed cookie after the first D1 lookup. Subsequent `getSession()` calls verify the HMAC signature only — ~1ms CPU instead of ~10ms.

```typescript
session: {
  cookieCache: {
    enabled: true,
    maxAge: 5 * 60, // 5 minutes
  },
}
```

Trade-off: revoked sessions remain valid for up to 5 minutes.

## Livestore Retry Backoff

**File:** `patches/@livestore%2Fsync-cf@0.4.0-dev.22.patch`

The livestore library ships with `Schedule.fixed(1000)` — infinite 1-second retries with no configuration option. Patched via `bun patch` to use exponential backoff with a cap:

```typescript
// Before
retryTransientErrors: Schedule.fixed(1000);

// After — 1s → 2s → 4s → 8s → 16s → stop
retryTransientErrors: Schedule.exponential("1 seconds", 2).pipe(
  Schedule.intersect(Schedule.recurs(5))
);
```

5 attempts over 31 seconds instead of 60+/min indefinitely. After exhausting retries, the UI shows "Sync paused".

Livestore's `SubscriptionRef.changes` only emits on actual state transitions (true→false), not on each retry. So the `ConnectionMonitor` (`src/livestore/store.ts`) fires once per disconnect, not per retry.

### Upstream issues to file

- Auth failures (HTTP 400/401/403 before WS upgrade) are treated as transient socket errors and retried. They should be non-retryable.
- `retryTransientErrors` schedule should be configurable, not hardcoded.

## Rate Limiting

**Files:** `wrangler.toml`, `src/cf-worker/index.ts`, `src/cf-worker/shared.ts`

30 requests per 60 seconds per IP via Cloudflare Workers Rate Limiting binding.

```toml
[[ratelimits]]
name = "SYNC_RATE_LIMITER"
namespace_id = "1001"
simple = { limit = 30, period = 60 }
```

Runs at the top of the fetch handler before any auth/D1 calls. Uses prefix matching:

```typescript
const RATE_LIMITED_PREFIXES = ["/sync", "/api/sync/", "/api/auth/"];
```

Returns 429 with `Retry-After: 60`. Runs inside the Worker (not at the edge), but with cookie cache each invocation is cheap.

### 429 Toast Notifications

**Files:** `src/stores/sync-status-store.ts`, `src/hooks/use-org-features.ts`

Both `fetchSyncAuthStatus` and `fetchMe` detect 429 responses and show a sonner toast ("Too many requests — sync will resume shortly") so the user gets feedback instead of silent failures. `<Toaster>` is mounted in `src/main.tsx`.

## Global SWR Configuration

**File:** `src/main.tsx`

`SWRConfig` provider at the app root caps all SWR hooks:

```typescript
<SWRConfig value={{
  revalidateOnFocus: false,
  errorRetryCount: 3,
  dedupingInterval: 10_000,
}}>
```

Individual hooks can override (e.g. `useOrgFeatures` uses `dedupingInterval: 30_000`).

## `/me` Error Boundary

**File:** `src/cf-worker/org/service.ts`

`handleGetMe` wraps the Effect pipeline with `Effect.catchAllDefect` and a `.catch()` on the outer `Effect.runPromise`. Returns proper 500 JSON responses instead of crashing. `fetchMe` on the client checks `res.ok` before parsing.

## Observability

**File:** `src/cf-worker/sync/index.ts`

- DO constructor logs `doId` on every wake-up
- `onPush` logs storeId (unmasked), batch size, and event names
- `validatePayload` logs warnings on auth failures (missing cookie, invalid session, org mismatch)

### DO namespace IDs

Find namespace IDs in the Cloudflare dashboard under Workers & Pages → Durable Objects. Each DO class gets a unique namespace ID.

Note: `idFromName(orgId)` produces different hashes per environment (local vs production) because it depends on the namespace ID. To map a DO instance ID to an org, use the `onPush` logs or query the GraphQL API by `objectId`.

### Querying DO metrics

The CF GraphQL Analytics API exposes per-namespace `rowsWritten` via `durableObjectsPeriodicGroups` (dimensions: `namespaceId`, `objectId`, `date`, `datetimeHour`). This was initially believed to be unavailable but was found via schema introspection.

**Script:** `scripts/do-metrics.sh` — queries rows_written per namespace, hourly breakdowns, per-object breakdowns, and WebSocket message counts.

**Wrangler tail:** `bunx wrangler tail --format json > tail-$(date -u +%Y-%m-%dT%H_%M_%S)Z.json`

## Extended Ping Interval

**File:** `src/livestore.worker.ts`

On 2026-02-10, we investigated DO duration exhaustion. Key findings:

1. **DO hibernation works with WebSockets open** — Cloudflare's WebSocket Hibernation API holds connections at the edge while the DO sleeps. The DO only wakes when a message arrives.

2. **Pings wake the DO** — Livestore's default 10s ping interval means 6 wake-ups/minute/user. Each wake prevents hibernation.

3. **Pings are only for connection health checks** — They detect silent disconnects proactively. Without pings, sync still works; the client just discovers dead connections on the next actual push/pull (1-2s delay).

Solution: Set ping interval to 5 minutes (from 10s default). This reduces DO wake-ups by 30x while keeping WebSocket connections alive through Cloudflare's idle timeout.

```typescript
makeWsSync({
  url: `${globalThis.location.origin}/sync`,
  ping: { requestInterval: 300_000 }, // 5 min
});
```

**History:** Initially set to 30 min on 2026-02-10 to minimize wake-ups. On 2026-02-11, discovered that 30 min was too long — Cloudflare drops idle WebSocket connections before the ping fires, causing frequent reconnects. Each reconnect triggers a full livestore `makeDoCtx` reinitialization with heavy SQL writes, which was the primary driver of `rows_written` quota exhaustion. 5 min is a better balance: keeps connections alive while still being 30x fewer wake-ups than the 10s default.

## Defense Layers Summary

| Layer            | Prevents                          | Config                         |
| ---------------- | --------------------------------- | ------------------------------ |
| Cookie cache     | `getSession()` exceeding 10ms CPU | 5 min TTL                      |
| Retry backoff    | Infinite reconnect storms         | 5 retries, exponential, 31s    |
| Rate limiter     | Any single IP flooding the API    | 30 req/min per IP              |
| Toast on 429     | Silent failures confusing users   | sonner, bottom-right           |
| Global SWR       | SWR retry storms on errors        | 3 retries, no focus revalidate |
| Error boundaries | Unhandled crashes on `/me`        | Effect catchAllDefect          |
| Logging          | Blind spots in auth/sync failures | Structured warnings            |
| Ping interval    | Frequent DO wake-ups              | 5 min (default was 10s)        |
| Usage analytics  | No visibility into per-user load  | CF Analytics Engine, admin UI  |

## Per-User Usage Analytics

**Spec:** `docs/specs/usage-analytics.md`

Fire-and-forget writes to Cloudflare Analytics Engine at 5 instrumentation points (sync, sync_auth, auth, chat, ingest). Queryable from the admin modal's "Usage" tab via CF SQL API. Adds ~0ms CPU overhead per request.

### Bug fix: CF Analytics Engine returns string counts

The Analytics Engine SQL API returns `count()` values as **strings**, not numbers. Without explicit conversion, JavaScript's `+` operator concatenates instead of adding: `0 + "9" + "5"` = `"095"` instead of `14`. This caused the admin UI to display nonsensical totals (e.g. "0965444" instead of 32).

**Fix:** `queryUsage()` in `src/cf-worker/analytics.ts` now converts `count` to `Number()` when mapping API response rows. Covered by unit tests in `src/cf-worker/__tests__/unit/analytics.test.ts`.

## rows_written Quota (2026-02-11)

On 2026-02-11, exceeded the free tier `rows_written` limit (100,000/day). The limit is **account-wide** across all DO classes and all Workers projects on the account.

### Two types of DO SQLite

**SyncBackendDO** uses the DO's **native SQLite** (`this.ctx.storage.sql`). Writes are efficient: 1 INSERT = 1 `rows_written`. Per the livestore source, a push of N events costs exactly N+1 rows (N eventlog + 1 context cursor). Pulls and WebSocket connections cost 0 writes. DO wake-up costs 0 writes for existing stores.

**LinkProcessorDO and ChatAgentDO** use `createStoreDoPromise` from `@livestore/adapter-cloudflare`, which runs **Wasm SQLite** (SQLite compiled to WebAssembly). The DO has no file system, so livestore uses a Virtual File System (`CloudflareSqlVFS`) that stores the wasm SQLite database file as 64 KiB chunks in the DO's native SqlStorage:

```
vfs_files  — file metadata
vfs_blocks — database content, one row per 64 KiB block
```

Every wasm SQLite page flush → `INSERT OR REPLACE INTO vfs_blocks` → counts as `rows_written`. A single logical INSERT in wasm SQLite dirties data pages, index pages, and journal pages across two separate database files (eventlog db + state db), each flushed as separate `vfs_blocks` rows. The exact multiplier depends on SQLite page layout, but **each `store.commit()` in a client DO costs significantly more than 1 `rows_written`**.

### Write amplification

Each user event is written multiple times. The client DOs have VFS overhead on top:

| Where                                                          | Native rows_written per event |
| -------------------------------------------------------------- | ----------------------------- |
| SyncBackendDO eventlog + cursor (native SQLite)                | 2                             |
| LinkProcessorDO eventlog + changeset + materializer (wasm/VFS) | ~4-10 per commit              |
| ChatAgentDO same pattern when active (wasm/VFS)                | ~4-10 per commit              |

`processLink` calls `store.commit()` **7 separate times** (not batched), each as an individual wasm SQLite transaction with full VFS flush. This is the biggest source of write amplification.

### What happens when the limit is hit

Once `rows_written` is exhausted, any DO that tries to write SQL gets `Exceeded allowed rows written in Durable Objects free tier`. For SyncBackendDO, livestore's `makeDoCtx` runs `CREATE TABLE IF NOT EXISTS` which triggers the error. The DO crashes, the client retries the WebSocket, the DO wakes again, crashes again — a retry loop that generates errors until midnight UTC reset. Tail logs captured this: repeated DO wake-ups in quick succession, all failing immediately.

ChatAgentDO also fails at constructor time because the Agents SDK calls `this.sql` during `new ChatAgentDO()`.

### Immediate fixes applied

- Disabled `LinkInteracted` event (fired on every link click, was #1 event type by volume). Analytics-only tracking via `track("link_opened")` instead.
- Changed ping interval from 30 min to 5 min to reduce WebSocket disconnects. Each disconnect → reconnect → potential re-sync → VFS writes on client DOs.

### Confirmed: LinkProcessorDO is the culprit

Using the CF GraphQL Analytics API (`durableObjectsPeriodicGroups` dataset, which exposes `rowsWritten` per `namespaceId`), we confirmed the VFS overhead theory:

| Namespace                           | Example rowsWritten |
| ----------------------------------- | ------------------- |
| LinkProcessorDO (wasm SQLite + VFS) | **~114k**           |
| SyncBackendDO (native SQLite)       | **~141**            |

LinkProcessorDO accounts for **~99.9%** of all `rows_written`. The VFS layer (wasm SQLite → `vfs_blocks`) amplifies every logical event write into multiple native rows. SyncBackendDO with native SQLite is extremely efficient.

**Script:** `scripts/do-metrics.sh` queries `rowsWritten` per namespace, hourly breakdowns, and per-object breakdowns via the CF GraphQL API.

## LinkProcessorDO Refactor Research (2026-02-12)

All three LinkProcessorDO triggers disabled while investigating alternatives. See `docs/link-processor-refactor.md` for full research.

### Current status

- [x] Disabled `onPush` trigger in SyncBackendDO
- [x] Disabled ingest API trigger
- [x] Disabled Telegram bot trigger

### Root cause: wasm SQLite + VFS write amplification

`createStoreDoPromise` from `@livestore/adapter-cloudflare` runs wasm SQLite with `CloudflareSqlVFS`. The VFS stores the wasm SQLite database as 64 KiB blocks in `vfs_blocks` table on native DO SqlStorage. Every `jWrite()` call (per SQL statement, NOT per transaction) triggers `INSERT OR REPLACE INTO vfs_blocks`. This causes ~4-10 native rows_written per logical `store.commit()`.

### Approaches investigated and ruled out

| Approach                                                  | Why ruled out                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Native DO SQLite adapter**                              | CF's `ctx.storage.sql` doesn't expose the SQLite session extension. Livestore's materializer calls `session()` unconditionally on every event to record changesets for rebase. No session = empty changesets = silent data corruption on rebase. Custom changeset implementations (triggers, snapshot diffing) can't produce SQLite's native binary changeset format that `makeChangeset().invert().apply()` expects. |
| **Batch commits (7→1)**                                   | VFS flushes per SQL statement (`jWrite()`), not per transaction. Batching 7 events into 1 commit = same ~21-35 `vfs_blocks` rows. Only saves BEGIN/COMMIT overhead (negligible).                                                                                                                                                                                                                                      |
| **Raw SQL event injection in onPush**                     | No built-in server-side push API. Would require manual seqNum management, manual broadcast to WebSocket/RPC clients, tightly coupled to livestore internals. Fragile and would break on upstream updates.                                                                                                                                                                                                             |
| **Worker + R2 storage**                                   | R2 has no synchronous API (VFS requires sync). Workers are stateless (would reload DB per request). R2 Class A ops quota would also be exhausted.                                                                                                                                                                                                                                                                     |
| **VFS write batching (buffer in jWrite, flush in jSync)** | Promising in theory (~50% reduction) but risky — modifying VFS internals could break SQLite's durability guarantees. May not be sufficient alone.                                                                                                                                                                                                                                                                     |

### Key finding: livestore has a "public API" adapter

`@livestore/adapter-cloudflare/src/make-sqlite-db.ts` contains `makeSqliteDb_()` — a complete `SqliteDb` implementation that wraps `ctx.storage.sql` directly (native DO SQLite, zero VFS). It stubs `session()` (returns empty changeset) and `makeChangeset().invert()`/`.apply()` (throws).

`makeAdapter` in `make-adapter.ts` currently hardcodes the wasm path:

```typescript
const sqlite3 = yield * Effect.promise(() => loadSqlite3Wasm());
const makeSqliteDb = sqliteDbFactory({ sqlite3 }); // ← always wasm + VFS
```

Swapping to the public API adapter would eliminate VFS entirely. The question is whether `invert()`/`apply()` ever executes for a sequential server-side client that never has conflicting local state.

### Viable architectures (not yet implemented)

| Architecture                        | How it works                                                                                                      | Rows/link      | Complexity  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------- | ----------- |
| **Patch adapter to use public API** | Swap `sqliteDbFactory` for `makeSqliteDb` in `makeAdapter`. Eliminates VFS. Risk: rebase would fail if triggered. | ~7-14 (native) | Low (patch) |
| **Queue + stateless processing**    | `onPush` → Queue → Consumer Worker (30s CPU) → results back to SyncBackendDO                                      | ~4-7 (native)  | Medium      |
| **SyncBackendDO alarm**             | `onPush` → store job → `setAlarm()` → alarm processes link → write events directly                                | ~5-8 (native)  | Medium      |
| **D1 staging + client commit**      | Queue Consumer → results in D1 → client polls → `store.commit()` → normal sync                                    | 0 server-side  | Medium      |

### CF infrastructure options researched

| Primitive             | CPU limit    | Free tier                           | Triggered from DO?       |
| --------------------- | ------------ | ----------------------------------- | ------------------------ |
| Workers (fetch)       | 10ms         | 100k req/day                        | Via `fetch()`            |
| **Durable Objects**   | **30s**      | 100k req/day, 100k rows_written/day | Yes (stub)               |
| **Queues (consumer)** | **30s**      | 10k ops/day (~3.3k msgs)            | Yes (`env.QUEUE.send()`) |
| Workflows (step)      | 10ms on free | 100k exec/day                       | Yes                      |
| D1                    | N/A          | 100k writes/day (separate from DO)  | Yes                      |
| KV                    | N/A          | 1k writes/day                       | Yes                      |
| R2                    | N/A          | 1M class A/month                    | Yes                      |

Key insight: DOs get **30s CPU** (not 10ms like Workers). Queue consumers also get **30s CPU + 15min wall time**. The bottleneck was never CPU — it was always VFS write amplification.

## Still TODO

- [ ] File upstream livestore issue: auth failures should be non-retryable
- [ ] File upstream livestore issue: `ping.enabled` option is defined but never checked in code
- [ ] Investigate ChatAgentDO's 46% error rate
- [ ] **Decide on LinkProcessorDO architecture** — see research above and `docs/link-processor-refactor.md`
- [ ] **Verify public API adapter safety** — does a sequential server-side livestore client ever trigger rebase? If not, patching `makeAdapter` to use native SQLite is the simplest fix.
- [ ] **Combine processor events into single `linkProcessed`** — Currently emits 5+ events per link. A single event with all results would cut writes by ~80%.
- [ ] **Re-enable `LinkInteracted` with batching** — Currently disabled to save writes. Could re-enable with client-side debouncing.
- [ ] **Investigate periodic WebSocket disconnects** — WS connections restart after ~10-30 minutes inconsistently. Check if disconnects correlate with ping timing and whether `setWebSocketAutoResponse` would help.

# Worker Resilience & Rate Limiting

Mechanisms in place to prevent request storms, CPU exhaustion, and cascade failures on the Cloudflare Workers free tier.

## Background

On 2026-02-09, a cascade failure took down sync for ~1 hour. `auth.api.getSession()` costs ~10ms CPU — right at the Workers free tier 10ms limit. When it intermittently exceeded the limit, the livestore client retried every 1 second indefinitely, creating a storm that overwhelmed D1 and exhausted the daily Durable Objects duration quota.

Full incident log analysis is in `logs-2026-02-09T22_48_42.928Z.csv` (654 rows, 3 users affected).

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

- `onPush` logs storeId (masked), batch size, and event names
- `validatePayload` logs warnings on auth failures (missing cookie, invalid session, org mismatch)

## Extended Ping Interval

**File:** `src/livestore.worker.ts`

On 2026-02-10, we investigated DO duration exhaustion. Key findings:

1. **DO hibernation works with WebSockets open** — Cloudflare's WebSocket Hibernation API holds connections at the edge while the DO sleeps. The DO only wakes when a message arrives.

2. **Pings wake the DO** — Livestore's default 10s ping interval means 6 wake-ups/minute/user. Each wake prevents hibernation.

3. **Pings are only for connection health checks** — They detect silent disconnects proactively. Without pings, sync still works; the client just discovers dead connections on the next actual push/pull (1-2s delay).

Solution: Increase ping interval to 30 minutes (from 10s default). This reduces DO wake-ups by 180x while keeping connection health checks.

```typescript
makeWsSync({
  url: `${globalThis.location.origin}/sync`,
  ping: { requestInterval: 1_800_000 }, // 30 min
})
```

Trade-off: Slower detection of dead connections (up to 30 min). Acceptable for a link-saving app — the connection will be verified on the next actual sync operation anyway.

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
| Ping interval    | Frequent DO wake-ups              | 30 min (default was 10s)       |
| Usage analytics  | No visibility into per-user load  | CF Analytics Engine, admin UI  |

## Per-User Usage Analytics

**Spec:** `docs/specs/usage-analytics.md`

Fire-and-forget writes to Cloudflare Analytics Engine at 5 instrumentation points (sync, sync_auth, auth, chat, ingest). Queryable from the admin modal's "Usage" tab via CF SQL API. Adds ~0ms CPU overhead per request.

## rows_written Quota (2026-02-11)

On 2026-02-11, hit 90% of the free tier `rows_written` limit (100,000/day). Every `INSERT`/`UPDATE`/`DELETE` on DO SQLite counts, including KV operations (`ctx.storage.put/get`) which use a hidden SQLite table.

**Root cause: write amplification across DOs.** Each user event is written multiple times:

| Where | Rows per event |
| --- | --- |
| SyncBackendDO eventlog | 1 |
| SyncBackendDO context cursor | 1 per push |
| LinkProcessorDO local eventlog (replica) | 1 |
| LinkProcessorDO materialized views | 1-2 |
| LinkProcessorDO context cursor | 1 per sync |
| ChatAgentDO (3 orgs) | 3-4 |

One event ≈ 5-6 rows written. Link processing generates ~5 events per link → ~30 rows per link created.

**Immediate fix:** Disabled `LinkInteracted` event (fired on every link click, was #1 event type by volume). Analytics-only tracking via `track("link_opened")` instead.

**Cloudflare limitations:** The GraphQL Analytics API doesn't expose per-DO-class `rows_written` — only `storedBytes`, invocation counts, and CPU time. Dashboard Observability tab doesn't filter by DO class either. So we can't get a definitive breakdown of which DO is the biggest writer.

## Still TODO

- [ ] File upstream livestore issue: auth failures should be non-retryable
- [ ] File upstream livestore issue: `ping.enabled` option is defined but never checked in code
- [ ] Debounce `triggerLinkProcessor` in `onPush`
- [ ] Investigate ChatAgentDO's 46% error rate
- [ ] **Remove LiveStore replica from LinkProcessorDO** — Currently `createStoreDoPromise` with `livePull: true` maintains a full local eventlog + materialized views inside LinkProcessorDO's SQLite. This doubles write amplification for every event. Instead, pass link data directly in the `triggerLinkProcessor` fetch call and write processing results back to SyncBackendDO via RPC. Eliminates ~50% of all `rows_written`.
- [ ] **Combine processor events into single `linkProcessed`** — Currently emits 5+ events per link (`processingStarted`, `metadataFetched`, `summarized`, `tagSuggested` × N, `processingCompleted`). A single `linkProcessed` event with all results would cut processor writes by ~80%.
- [ ] **Batch `tagSuggested` into `tagsSuggested`** — Fires once per tag suggestion. An array-based event would save 2-3 rows per link.
- [ ] **Re-enable `LinkInteracted` with batching** — Currently disabled to save writes. Could re-enable with client-side debouncing (batch interactions over 30s and push once) if interaction tracking is needed.
- [ ] **Investigate periodic WebSocket disconnects** — WS connections restart after ~10-30 minutes inconsistently. Could be Cloudflare's idle timeout evicting the DO, the edge dropping idle connections, or the 30-min ping interval being too long for Cloudflare's WebSocket keep-alive. Need to check if disconnects correlate with ping timing and whether `setWebSocketAutoResponse` (edge-level pong without waking DO) would help maintain connections.

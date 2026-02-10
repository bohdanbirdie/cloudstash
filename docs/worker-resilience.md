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
retryTransientErrors: Schedule.fixed(1000)

// After — 1s → 2s → 4s → 8s → 16s → stop
retryTransientErrors: Schedule.exponential('1 seconds', 2).pipe(
  Schedule.intersect(Schedule.recurs(5))
)
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

## Still TODO

- [ ] File upstream livestore issue: auth failures should be non-retryable
- [ ] Debounce `triggerLinkProcessor` in `onPush`
- [ ] Investigate ChatAgentDO's 46% error rate
- [ ] Consider paid Workers plan ($5/month) for 30ms CPU headroom

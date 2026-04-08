# Worker Resilience & Rate Limiting

Mechanisms to prevent request storms, CPU exhaustion, and cascade failures on Cloudflare Workers.

## Background

On 2026-02-09, a cascade failure took down sync for ~1 hour. `auth.api.getSession()` costs ~10ms CPU (at the free tier limit). When it intermittently exceeded the limit, livestore's infinite 1s retries created a storm that overwhelmed D1 and exhausted the daily DO duration quota.

## Defense Layers

| Layer                        | Prevents                          | Details                                                                                                                                                                       |
| ---------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Session cookie cache**     | `getSession()` exceeding 10ms CPU | Better Auth `cookieCache` with 5 min TTL — HMAC verify only (~1ms) instead of D1 lookup (~10ms). Trade-off: revoked sessions valid up to 5 min.                               |
| **Retry backoff (upstream)** | Infinite reconnect storms         | Livestore now has upstream exponential backoff (1s → 30s, jittered) via [PR #1144](https://github.com/livestorejs/livestore/pull/1144). Previously we patched this ourselves. |
| **Rate limiter**             | Any single IP flooding the API    | 30 req/60s per IP via CF Workers Rate Limiting on `/sync`, `/api/sync/`, `/api/auth/`. Returns 429 with `Retry-After: 60`.                                                    |
| **Toast on 429**             | Silent failures confusing users   | `fetchSyncAuthStatus` and `fetchMe` detect 429 → sonner toast.                                                                                                                |
| **Global SWR config**        | SWR retry storms                  | `errorRetryCount: 3`, `revalidateOnFocus: false`, `dedupingInterval: 10_000`.                                                                                                 |
| **`/me` error boundary**     | Unhandled crashes                 | `Effect.catchAllDefect` + outer `.catch()` → proper 500 JSON.                                                                                                                 |
| **Ping interval**            | Frequent DO wake-ups from pings   | Uses livestore defaults. History: default 10s caused 6 wake-ups/min/user, preventing hibernation. Increased to reduce DO duration.                                            |
| **Usage analytics**          | No visibility into per-user load  | CF Analytics Engine, fire-and-forget at 5 instrumentation points. See [[features/usage-analytics]].                                                                           |

## rows_written Quota (2026-02-11)

Exceeded free tier `rows_written` limit (100,000/day, account-wide across all DOs).

**Root cause:** LinkProcessorDO used wasm SQLite with `CloudflareSqlVFS`, which stored the DB as 64 KiB chunks in `vfs_blocks`. Every `store.commit()` triggered multiple `INSERT OR REPLACE INTO vfs_blocks` — ~4-10 native rows_written per logical commit.

**Fix:** Upstream [PR #1089](https://github.com/livestorejs/livestore/pull/1089) resolved the VFS write amplification. Our patch is no longer needed — the fix is included in the current livestore snapshot.

**Historical data:** LinkProcessorDO accounted for ~99.9% of all `rows_written` (~114k vs ~141 for SyncBackendDO with native SQLite). `scripts/do-metrics.sh` queries `rowsWritten` per namespace via CF GraphQL.

### What Happens When the Limit is Hit

All DO SQL writes fail with `Exceeded allowed rows written`. SyncBackendDO crashes on `CREATE TABLE IF NOT EXISTS` at boot → retry loop until midnight UTC reset.

## Observability

- DO constructor logs `doId` on every wake-up
- `onPush` logs storeId, batch size, event names
- `validatePayload` logs auth failure warnings
- `scripts/do-metrics.sh` queries `rowsWritten` per namespace via CF GraphQL Analytics API
- `bunx wrangler tail --format json` for live log capture

# Per-User Usage Analytics

Track per-user API usage via Cloudflare Analytics Engine to set reasonable limits and understand costs.

## Status: Live

Deployed 2026-02-11. Secrets set, Analytics Engine activated, data flowing.

- [x] Set `CF_ACCOUNT_ID` and `CF_ANALYTICS_TOKEN` secrets in CF dashboard
- [x] Add both to `.dev.vars` for local dev
- [x] Deploy worker to activate Analytics Engine binding
- [x] Verify data appears in admin modal

**Note:** Analytics Engine requires deploying the worker with the binding before the SQL API becomes accessible (returns 403 otherwise). The `USAGE_ANALYTICS` binding is undefined in local dev, so `trackEvent` no-ops locally.

## How it works

### Write path (fire-and-forget, ~0ms CPU)

`trackEvent()` calls `AnalyticsEngineDataset.writeDataPoint()` at 5 instrumentation points. The binding is undefined in local dev/tests, so calls safely no-op.

**Data schema per event:**

| Field        | Content                | Example     |
| ------------ | ---------------------- | ----------- |
| `indexes[0]` | userId                 | `"usr_abc"` |
| `blobs[0]`   | event type             | `"sync"`    |
| `blobs[1]`   | orgId                  | `"org_xyz"` |
| `doubles[0]` | HTTP status (0 if N/A) | `200`       |

**Instrumented events:**

| Event       | Trigger                     | File                                         |
| ----------- | --------------------------- | -------------------------------------------- |
| `sync`      | WebSocket sync connection   | `src/cf-worker/index.ts` (handleSync)        |
| `sync_auth` | `/api/sync/auth` pre-flight | `src/cf-worker/index.ts` (sync/auth handler) |
| `auth`      | `/api/auth/me` call         | `src/cf-worker/org/service.ts` (handleGetMe) |
| `chat`      | Chat agent connection       | `src/cf-worker/chat-agent/hooks.ts`          |
| `ingest`    | API ingestion               | `src/cf-worker/ingest/service.ts`            |

### Read path (admin only)

`GET /api/admin/usage?period=24h|7d|30d` queries the CF Analytics Engine SQL API and returns per-user/per-event counts. Protected by `requireAdmin` middleware.

### Admin UI

The "Usage" tab in the admin modal shows:

- Period selector (24h / 7d / 30d)
- Summary stats (total events, active users)
- Per-user table: User | Total | Sync | Auth | Chat | Ingest
- User names resolved from the admin user list (no extra API call)

## Key files

| File                                      | Role                                                            |
| ----------------------------------------- | --------------------------------------------------------------- |
| `wrangler.toml`                           | `analytics_engine_datasets` binding (default + staging)         |
| `src/cf-worker/shared.ts`                 | `USAGE_ANALYTICS`, `CF_ACCOUNT_ID`, `CF_ANALYTICS_TOKEN` in Env |
| `src/cf-worker/analytics.ts`              | `trackEvent()` + `queryUsage()`                                 |
| `src/cf-worker/auth/sync-auth.ts`         | Returns `{ userId }` for downstream tracking                    |
| `src/cf-worker/admin/usage.ts`            | Admin API endpoint                                              |
| `src/components/admin/use-usage-admin.ts` | SWR hook + pivot logic                                          |
| `src/components/admin/usage-tab.tsx`      | UI component                                                    |
| `src/components/admin/admin-modal.tsx`    | Hosts the Usage tab                                             |

## Cost

Analytics Engine free tier: 100k writes/day. Expected usage ~3k writes/day (3 users, ~1k events each). Well within limits.

## Design decisions

- **`checkSyncAuth` returns `{ userId }`** instead of `void` so all 3 callsites (handleSync, sync/auth, chat hooks) can track without re-reading the session.
- **Dataset name** derived from `BETTER_AUTH_URL` (contains "staging" for staging env) rather than a separate env var.
- **No DO instrumentation** — all tracking happens in the Worker layer to avoid adding CPU cost inside Durable Objects.

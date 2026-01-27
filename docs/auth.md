# Authentication Spec

## Overview

Google OAuth authentication using Better Auth with organization-scoped LiveStore sync and admin approval.

```
User → Google OAuth → Better Auth → Session Cookie → Approval Check → LiveStore (org-scoped)
```

New users require admin approval before accessing the app. See [admin-user-approval.md](specs/admin-user-approval.md) for details.

## Architecture

| Component   | Purpose                                                                             |
| ----------- | ----------------------------------------------------------------------------------- |
| Better Auth | OAuth, sessions (`organization`, `admin`, `apiKey` plugins)                         |
| D1          | Auth tables: user, session, account, verification, organization, member, invitation |
| LiveStore   | Org-scoped stores using `{organizationId}` as storeId                               |

## Files

| File                                   | Purpose                                     |
| -------------------------------------- | ------------------------------------------- |
| `src/cf-worker/auth/index.ts`          | Better Auth config with organization plugin |
| `src/cf-worker/auth/sync-auth.ts`      | Pre-flight sync auth check (Effect-based)   |
| `src/cf-worker/index.ts`               | Worker routes + session/org validation      |
| `src/cf-worker/db/schema.ts`           | Drizzle schema (auth + org tables)          |
| `src/lib/auth.tsx`                     | Auth client, provider, visibility refresh   |
| `src/router.tsx`                       | Router with auth context type               |
| `src/routes/__root.tsx`                | `beforeLoad` auth check + redirect          |
| `src/livestore/store.ts`               | `useAppStore` + connection monitoring       |
| `src/stores/sync-status-store.ts`      | Sync error state (Zustand)                  |
| `src/components/sync-error-banner.tsx` | Error banner for sync failures              |

## Auth Flow

### 1. Signup (Google OAuth)

```
Click "Sign in" → Google OAuth → Better Auth callback
                                       │
                         ┌─────────────┴─────────────┐
                         │ user.create.after hook    │
                         │ → Creates personal org    │
                         │ → Adds user as owner      │
                         └─────────────┬─────────────┘
                                       │
                         ┌─────────────┴─────────────┐
                         │ session.create.before     │
                         │ → Sets activeOrgId        │
                         └─────────────┬─────────────┘
                                       │
                         Set session cookie + redirect
```

### 2. Route Protection (TanStack Router)

Auth checked in `beforeLoad`, not during render:

```typescript
// src/routes/__root.tsx
beforeLoad: async ({ location }) => {
  const auth = await fetchAuth();
  if (!auth.isAuthenticated && location.pathname !== "/login") {
    throw redirect({ to: "/login" });
  }
  return { auth };
};
```

### 3. LiveStore Sync Connection

```
useAppStore() → WebSocket /sync?storeId={orgId}
                    │ (Cookie header auto-included)
                    │
      ┌─────────────┴─────────────┐
      │ validatePayload()         │
      │ → Get cookie from headers │
      │ → Validate session via    │
      │   auth.api.getSession()   │
      │ → Check session.activeOrg │
      │   matches storeId         │
      └─────────────┬─────────────┘
                    │
           Connection accepted
```

## Token Strategy

| Token          | Lifetime | Storage         | Purpose                  |
| -------------- | -------- | --------------- | ------------------------ |
| Session cookie | 14 days  | HttpOnly cookie | All auth (routes + sync) |

The session cookie is automatically included in same-origin WebSocket connections by the browser.

### Session Configuration

```typescript
// src/cf-worker/auth/index.ts
session: {
  expiresIn: 60 * 60 * 24 * 14,  // 14 days
  updateAge: 60 * 60 * 24 * 7,   // Refresh after 7 days of activity
}
```

- **Sliding window**: Session extends when user is active after `updateAge`
- **Long-lived tabs**: Supports tabs open for extended periods without refresh

---

## Session Refresh Strategy

For tabs left open indefinitely (up to 1 month), we use visibility-based refresh and connection monitoring.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SESSION KEEP-ALIVE FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Tab hidden for hours/days                                                   │
│           │                                                                  │
│           ▼                                                                  │
│  User returns to tab (visibility: visible)                                   │
│           │                                                                  │
│           ▼                                                                  │
│  authClient.getSession()  ─────────────────────────────────────────────────► │
│           │                                     Extends session via          │
│           │                                     sliding window               │
│           ▼                                                                  │
│  Session valid? ────────── No ──────► Redirect to /login                     │
│           │                                                                  │
│          Yes                                                                 │
│           │                                                                  │
│           ▼                                                                  │
│  Continue normally                                                           │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                     SYNC CONNECTION FAILURE FLOW                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LiveStore sync connection fails                                             │
│           │                                                                  │
│           ▼                                                                  │
│  ConnectionMonitor detects !isConnected                                      │
│           │                                                                  │
│           ▼                                                                  │
│  fetchSyncAuthError(store.storeId) ────► GET /api/sync/auth?storeId=...      │
│           │                                                                  │
│           ▼                                                                  │
│  store.shutdownPromise() (stops retries)                                     │
│           │                                                                  │
│           ▼                                                                  │
│  Show SyncErrorBanner with actual reason                                     │
│  (SESSION_EXPIRED, ACCESS_DENIED, UNAPPROVED, UNKNOWN)                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation

#### 1. Visibility-Based Session Refresh

```typescript
// src/lib/auth.tsx (AuthProvider)
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      // Refresh session when tab becomes visible
      authClient.getSession().then(({ data }) => {
        if (!data?.session) {
          // Session expired - redirect to login
          window.location.href = "/login";
        }
        // Also update auth state (approved status may have changed)
        if (data?.user) {
          setAuth({
            userId: data.user.id,
            orgId: data.user.approved
              ? (data.session.activeOrganizationId ?? null)
              : null,
            isAuthenticated:
              data.user.approved && !!data.session.activeOrganizationId,
            role: data.user.role ?? "user",
            approved: data.user.approved ?? false,
          });
        }
      });
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
  return () =>
    document.removeEventListener("visibilitychange", handleVisibilityChange);
}, []);
```

**Note**: Unapproved users see `<PendingApproval />` screen and never reach LiveStore, so connection monitoring only applies to approved users.

#### 2. LiveStore Connection Monitoring

LiveStore exposes `store.networkStatus` for detecting connection loss:

```typescript
// Available on store object
store.networkStatus; // Subscribable<{ isConnected: boolean, timestampMs: number }>
```

When connection drops, fetch the actual error reason and show a banner:

```typescript
// src/livestore/store.ts - ConnectionMonitor
const useConnectionMonitor = (store: any) => {
  useEffect(() => {
    store.networkStatus.changes.pipe(
      Stream.tap((status) => {
        if (!status.isConnected) {
          // Fetch actual error reason from server
          fetchSyncAuthError(store.storeId).then(async (error) => {
            await store.shutdownPromise(); // Stop retries

            // Show error banner
            useSyncStatusStore.getState().setError(
              error ?? {
                code: "UNKNOWN",
                message: "Sync connection lost. Please reload to reconnect.",
              }
            );
          });
        }
      }),
      Stream.runDrain,
      Effect.scoped,
      Effect.runPromise
    );
  }, [store]);
};
```

**Note**: Uses `store.storeId` instead of hardcoded `auth.orgId` for future-proofing when we add non-org store types.

### LiveStore APIs for Session Management

| API                       | Type                | Purpose                                        |
| ------------------------- | ------------------- | ---------------------------------------------- |
| `store.useSyncStatus()`   | React hook          | `{ isSynced, pendingCount }` - data sync state |
| `store.networkStatus`     | Effect Subscribable | `{ isConnected }` - WebSocket connection state |
| `store.shutdownPromise()` | async method        | Stop all retries, close connections            |
| `store.storeId`           | string              | Store identifier (orgId for org stores)        |

### Sync Error State (Zustand)

| API                           | Purpose                                  |
| ----------------------------- | ---------------------------------------- |
| `useSyncStatusStore.error`    | Current sync error or null               |
| `useSyncStatusStore.setError` | Set error to show banner                 |
| `fetchSyncAuthError(storeId)` | Fetch error reason from `/api/sync/auth` |

### Why This Approach

1. **No polling** - Zero requests while tab is hidden
2. **Instant refresh** - Session extends exactly when user returns
3. **Graceful degradation** - Expired session shows login instead of infinite retries
4. **LiveStore-aware** - Uses native APIs to detect and stop retry loop

### Clear Local Data on Logout

On logout, we clear OPFS (Origin Private File System) data to prevent the next user from accessing cached data on shared devices.

**Challenge**: OPFS is locked while LiveStore is mounted.

**Solution**: Dedicated `/logout` route that unmounts LiveStore first, then clears OPFS.

```
┌─────────────────────────────────────────────────────────────────┐
│                      LOGOUT FLOW                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User clicks "Sign out"                                         │
│           │                                                     │
│           ▼                                                     │
│  Navigate to /logout (outside _authed route)                    │
│           │                                                     │
│           ▼                                                     │
│  LiveStore unmounts (no longer rendered)                        │
│           │                                                     │
│           ▼                                                     │
│  Clear OPFS directories (navigator.storage.getDirectory())      │
│           │                                                     │
│           ▼                                                     │
│  authClient.signOut()                                           │
│           │                                                     │
│           ▼                                                     │
│  Redirect to /login                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

```typescript
// src/routes/logout.tsx
export function LogoutPage() {
  useEffect(() => {
    async function cleanup() {
      // Clear all LiveStore OPFS directories
      const root = await navigator.storage.getDirectory()
      for await (const name of root.keys()) {
        if (name.startsWith('livestore-')) {
          await root.removeEntry(name, { recursive: true })
        }
      }
      await authClient.signOut()
      window.location.href = '/login'
    }
    cleanup()
  }, [])

  return <div>Signing out...</div>
}
```

**Why this works**:

- `/logout` is outside the `_authed` route, so LiveStore unmounts
- OPFS is no longer locked once LiveStore unmounts
- Direct OPFS clearing via browser API - no workarounds needed

**What gets deleted**:

- All `livestore-*` directories in OPFS (state DB, eventlog, archives)

**What's preserved**:

- Server-side data (sync backend has the source of truth)
- Re-syncs fresh data on next login

### Auth State Type

```typescript
// src/lib/auth.tsx
type AuthState = {
  userId: string | null;
  orgId: string | null;
  isAuthenticated: boolean; // true only if approved AND has activeOrgId
  role: string | null; // 'user' | 'admin'
  approved: boolean; // requires admin approval
};
```

- **Unapproved users** (`approved: false`): See `<PendingApproval />` screen, never reach LiveStore
- **Approved users** (`approved: true`): Full app access with LiveStore sync

## API Endpoints

### Better Auth (handled by `auth.handler`)

- `POST /api/auth/sign-in/social` - Google OAuth initiation
- `GET /api/auth/callback/google` - OAuth callback
- `GET /api/auth/get-session` - Get current session
- `POST /api/auth/sign-up/email` - Email signup (test env only)

### Custom Endpoints

#### `GET /api/auth/me`

Returns current authenticated user with organization info.

```typescript
// Response 200
{
  user: { id, name, email },
  session: { activeOrganizationId },
  organization: { id, name, slug } | null
}

// Response 401
{ error: "Unauthorized" }
```

#### `GET /api/sync/auth?storeId={id}`

Pre-flight auth check for sync connections. Called by client to get actual error reason when sync fails.

```typescript
// Response 200 (auth OK)
{ ok: true }

// Response 401 (session issues)
{ status: 401, code: "SESSION_EXPIRED", message: "Session expired or invalid" }

// Response 403 (access denied)
{ status: 403, code: "ACCESS_DENIED", message: "You do not have access to this workspace" }
{ status: 403, code: "UNAPPROVED", message: "Account pending approval" }
```

#### `GET /api/org/:id`

Returns organization if user is a member.

```typescript
// Response 200 (member)
{
  (id, name, slug, role);
}

// Response 403 (not member)
{
  error: "Access denied";
}

// Response 404 (not found)
{
  error: "Organization not found";
}
```

## Environment Variables

| Variable               | Description                                         |
| ---------------------- | --------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID                              |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret                          |
| `BETTER_AUTH_SECRET`   | Secret for signing (32+ chars)                      |
| `BETTER_AUTH_URL`      | Base URL (e.g., `http://localhost:3000`)            |
| `ENABLE_TEST_AUTH`     | Set to `"true"` to enable email signup (tests only) |

## Database Schema

### Auth Tables (Better Auth)

- `user` - id, name, email, emailVerified, image, timestamps
- `session` - id, token, userId, activeOrganizationId, timestamps
- `account` - OAuth provider links
- `verification` - Email verification tokens

### Organization Tables

- `organization` - id, name, slug, logo, metadata, createdAt
- `member` - id, organizationId, userId, role, createdAt
- `invitation` - id, organizationId, email, role, status, expiresAt

## E2E Testing

### Setup

Tests use `@cloudflare/vitest-pool-workers` with isolated D1 database.

```bash
bun run test:e2e    # Run e2e tests
bun run test:unit   # Run unit tests
```

### Test Environment

- `ENABLE_TEST_AUTH=true` enables email/password signup
- Fresh in-memory D1 per test run (no effect on local dev DB)
- Migrations loaded from `drizzle/migrations/` and applied before tests

### Configuration

The `vitest.e2e.config.ts`:

1. **Loads migrations** from drizzle files in Node.js context
2. **Passes migrations** to Workers via `TEST_MIGRATIONS` binding
3. **Bundles dependencies** via `ssr.noExternal` for tree-shaking

```typescript
// Load migrations in Node.js context
const migrations = journal.entries.map((entry) => ({
  tag: entry.tag,
  sql: fs.readFileSync(`drizzle/migrations/${entry.tag}.sql`, "utf-8"),
}));

export default defineWorkersConfig({
  // ...
  miniflare: {
    bindings: {
      TEST_MIGRATIONS: JSON.stringify(migrations),
    },
  },
  ssr: {
    noExternal: ["effect", /@effect\//, /@livestore\//, /@opentelemetry\//],
  },
});
```

### Test Files

```
src/cf-worker/__tests__/
├── e2e/
│   ├── auth.test.ts    # Auth endpoint tests
│   ├── sync.test.ts    # LiveStore sync auth tests
│   └── setup.ts        # Applies migrations from TEST_MIGRATIONS binding
├── unit/               # Unit tests
└── env.d.ts            # Type declarations (ProvidedEnv)
```

### Auth Test Cases (auth.test.ts)

| Test                             | Expected          |
| -------------------------------- | ----------------- |
| `GET /api/auth/me` (no auth)     | 401 Unauthorized  |
| `GET /api/auth/me` (with cookie) | 200 + user data   |
| `GET /api/org/{myOrgId}`         | 200 + org data    |
| `GET /api/org/{otherOrgId}`      | 403 Access denied |
| `GET /api/org/{nonExistent}`     | 404 Not found     |
| User A and B have different orgs | Isolated          |

### Sync Test Cases (sync.test.ts)

| Test                                      | Expected                     |
| ----------------------------------------- | ---------------------------- |
| Sync without cookie                       | 400 (Missing session cookie) |
| Sync with invalid cookie                  | 400 (Invalid session)        |
| Sync with wrong orgId                     | 400 (Access denied)          |
| Sync with valid cookie + matching storeId | Success (not 400)            |
| User B cannot sync with User A's org      | 400 (Access denied)          |

### Test Flow

```typescript
// 1. Signup creates user + org via databaseHooks
const res = await SELF.fetch("/api/auth/sign-up/email", {
  method: "POST",
  body: JSON.stringify({ email, password, name }),
});
const cookie = res.headers.get("set-cookie");

// 2. Get user info via /me endpoint
const me = await SELF.fetch("/api/auth/me", {
  headers: { Cookie: cookie },
});

// 3. Test org access
const org = await SELF.fetch(`/api/org/${orgId}`, {
  headers: { Cookie: cookie },
});
```

## Local Development

```bash
# 1. Create .dev.vars
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
BETTER_AUTH_SECRET=random-32-char-string
BETTER_AUTH_URL=http://localhost:3000

# 2. Apply migrations
bun run db:migrate:local

# 3. Run
bun run dev
```

Google OAuth redirect URI: `http://localhost:3000/api/auth/callback/google`

## Production

```bash
# 1. Set secrets
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put BETTER_AUTH_URL

# 2. Apply migrations
bun run db:migrate:remote

# 3. Deploy
bun run deploy
```

Google OAuth redirect URI: `https://your-domain.workers.dev/api/auth/callback/google`

## Security

- [x] HttpOnly, Secure, SameSite cookies
- [x] Org-scoped sync (storeId = organizationId)
- [x] Cookie-based sync auth (session validation)
- [x] Router-level auth (`beforeLoad`)
- [x] Server-side org validation via session
- [x] API key rate limiting (100/day)
- [x] Admin approval required for new users
- [x] Admin plugin for user management (ban, role assignment)
- [x] Visibility-based session refresh
- [x] Connection monitoring + graceful shutdown on expiry
- [ ] Clear local data on logout (OPFS) - see [Logout Flow](#clear-local-data-on-logout)

---

## API Key Rate Limiting

Better Auth's API Key plugin has built-in rate limiting. **Default is very restrictive: 10 requests/day.**

### Configuration

```typescript
// src/cf-worker/auth/index.ts
apiKey({
  defaultPrefix: 'lb',
  enableMetadata: true,
  rateLimit: {
    enabled: true,
    timeWindow: 1000 * 60 * 60 * 24, // 1 day
    maxRequests: 100,  // 100 requests per day
  },
}),
```

### Rate Limit Storage

Rate limit state is stored per-key in D1:

- `lastRequest` - timestamp of last request
- `rateLimitEnabled`, `rateLimitTimeWindow`, `rateLimitMax` - per-key config

### Resetting a Rate-Limited Key

If a key hits its limit, options:

1. **Wait** for the time window to pass (24h)
2. **Generate new key** - fresh key has no history
3. **Reset in D1**: `UPDATE apikey SET lastRequest = NULL WHERE id = '...'`

---

## Observability

Workers Logs enabled in `wrangler.toml`:

```toml
[observability]
enabled = true

[observability.logs]
enabled = true
invocation_logs = true
```

### Pricing

| Plan         | Included         | Overage           |
| ------------ | ---------------- | ----------------- |
| Free         | 200,000 logs/day | Stops logging     |
| Paid ($5/mo) | 20M/month        | $0.60 per million |

Optional sampling to reduce volume:

```toml
head_sampling_rate = 0.1  # Only log 10% of requests
```

---

## WAF Rate Limiting (Edge)

Cloudflare WAF can block requests at the edge before Workers are invoked. This protects against quota exhaustion from retry spam.

### Configuration

Dashboard → Security → WAF → Rate limiting rules

Example rule for `/sync`:

- **Expression**: `http.request.uri.path eq "/sync"`
- **Rate**: 10 requests per 10 seconds per IP
- **Action**: Block (429)
- **Duration**: 60 seconds

### Pricing

**Free** on all plans (unmetered). 5 rules on Free plan.

### Limitation

WAF rate limiting requires a custom domain on Cloudflare. Not available for `*.workers.dev` domains.

---

## Historical Note: JWT Removal

Previously, LiveStore sync used short-lived JWTs (1 hour) passed as a `payload` parameter in the WebSocket URL. This approach had a problem: **token refresh**.

### How JWT Auth Worked (Removed)

```
Client: fetchAuth() → authClient.token() → JWT (1h expiry)
        ↓
Client: useAppStore() → WebSocket /sync?payload={jwt}
        ↓
Server: validatePayload() → JWKS fetch → JWT verify → check claims.orgId
```

**Problems:**

1. JWT expired after 1 hour, but LiveStore had no built-in refresh mechanism
2. Required proactive refresh timers or store recreation on expiry
3. Added complexity: `jose` library, JWKS endpoint, JWT claims validation

### Why Cookie Auth is Better

1. **Long-lived sessions** - 14-day session with sliding window refresh
2. **Simpler code** - No JWT plugin, no JWKS, no token fetching
3. **Consistent auth** - Same session cookie used for routes and sync
4. **LiveStore native support** - `validatePayload` receives request headers
5. **Visibility refresh** - Session extends when user returns to hidden tab

The session cookie is automatically sent with same-origin WebSocket connections, so the client code doesn't need to handle auth at all - it "just works."

### Migration

If you have an existing deployment with the JWT `jwks` table, it can be safely ignored (Better Auth created it for the `jwt` plugin). No data migration is needed since JWTs were stateless and not stored.

---

## Known Limitation: LiveStore Infinite Retry

When a sync connection fails (auth error, session expired, etc.), LiveStore retries **indefinitely** every 1 second. This is hardcoded in `@livestore/sync-cf`:

```typescript
// ws-rpc-client.ts
retryTransientErrors: Schedule.fixed(1000); // Retry forever
```

### The Problem

- WebSocket errors don't carry HTTP status codes
- Auth failures (401/403) look identical to network errors
- Client keeps retrying with expired session → quota exhaustion

### Our Solution

Multi-layer approach:

1. **Pre-flight auth check** - Worker validates session before WebSocket upgrade
2. **Connection monitoring** - Detect connection loss via `store.networkStatus`
3. **Server-side error fetch** - Query `/api/sync/auth` to get actual error reason
4. **Error banner** - Show informative banner instead of silent redirect

```typescript
// ConnectionMonitor in src/livestore/store.ts
store.networkStatus.changes.pipe(
  Stream.tap((status) => {
    if (!status.isConnected) {
      // Fetch actual error reason from server
      const error = await fetchSyncAuthError(store.storeId);
      await store.shutdownPromise(); // Stops all retries

      // Show error banner (not redirect)
      useSyncStatusStore.getState().setError(
        error ?? {
          code: "UNKNOWN",
          message: "Sync connection lost",
        }
      );
    }
  })
);
```

Error codes: `SESSION_EXPIRED`, `ACCESS_DENIED`, `UNAPPROVED`, `UNKNOWN`

### Additional Mitigations

1. **14-day session** - Longer TTL reduces expiry likelihood
2. **Visibility refresh** - Session extends when user returns to tab
3. **WAF Rate Limiting** - Block at edge (requires custom domain)
4. **Observability** - Monitor for retry spam patterns

### Future LiveStore Improvement

LiveStore should add:

- `maxRetries` or `shouldRetry` callback in `WsSyncOptions`
- Distinguish auth errors from transient network errors

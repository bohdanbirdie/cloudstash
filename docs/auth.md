# Authentication Spec

## Overview

Google OAuth authentication using Better Auth with organization-scoped LiveStore sync.

```
User → Google OAuth → Better Auth → Session Cookie → LiveStore (org-scoped)
```

## Architecture

| Component   | Purpose                                                              |
| ----------- | -------------------------------------------------------------------- |
| Better Auth | OAuth, sessions (`organization` plugin)                              |
| D1          | Auth tables: user, session, account, verification, organization, member, invitation |
| LiveStore   | Org-scoped stores using `{organizationId}` as storeId                |

## Files

| File                         | Purpose                                       |
| ---------------------------- | --------------------------------------------- |
| `src/cf-worker/auth.ts`      | Better Auth config with organization plugin   |
| `src/cf-worker/index.ts`     | Worker routes + session/org validation        |
| `src/cf-worker/db/schema.ts` | Drizzle schema (auth + org tables)            |
| `src/lib/auth.ts`            | Auth client + `fetchAuth()` helper            |
| `src/router.tsx`             | Router with auth context type                 |
| `src/routes/__root.tsx`      | `beforeLoad` auth check + redirect            |
| `src/livestore/store.ts`     | `useAppStore` with session cookie auth        |

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
  const auth = await fetchAuth()
  if (!auth.isAuthenticated && location.pathname !== '/login') {
    throw redirect({ to: '/login' })
  }
  return { auth }
}
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

| Token          | Lifetime | Storage         | Purpose                     |
| -------------- | -------- | --------------- | --------------------------- |
| Session cookie | 7 days   | HttpOnly cookie | All auth (routes + sync)    |

The session cookie is automatically included in same-origin WebSocket connections by the browser.

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

#### `GET /api/org/:id`

Returns organization if user is a member.

```typescript
// Response 200 (member)
{
  ;(id, name, slug, role)
}

// Response 403 (not member)
{
  error: 'Access denied'
}

// Response 404 (not found)
{
  error: 'Organization not found'
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
  sql: fs.readFileSync(`drizzle/migrations/${entry.tag}.sql`, 'utf-8'),
}))

export default defineWorkersConfig({
  // ...
  miniflare: {
    bindings: {
      TEST_MIGRATIONS: JSON.stringify(migrations),
    },
  },
  ssr: {
    noExternal: ['effect', /@effect\//, /@livestore\//, /@opentelemetry\//],
  },
})
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
const res = await SELF.fetch('/api/auth/sign-up/email', {
  method: 'POST',
  body: JSON.stringify({ email, password, name }),
})
const cookie = res.headers.get('set-cookie')

// 2. Get user info via /me endpoint
const me = await SELF.fetch('/api/auth/me', {
  headers: { Cookie: cookie },
})

// 3. Test org access
const org = await SELF.fetch(`/api/org/${orgId}`, {
  headers: { Cookie: cookie },
})
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
- [ ] Clear local data on logout
- [ ] Handle session expiry on reconnect

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

1. **No refresh needed** - Session cookie (7 days) auto-included by browser
2. **Simpler code** - No JWT plugin, no JWKS, no token fetching
3. **Consistent auth** - Same session cookie used for routes and sync
4. **LiveStore native support** - `validatePayload` receives request headers

The session cookie is automatically sent with same-origin WebSocket connections, so the client code doesn't need to handle auth at all - it "just works."

### Migration

If you have an existing deployment with the JWT `jwks` table, it can be safely ignored (Better Auth created it for the `jwt` plugin). No data migration is needed since JWTs were stateless and not stored.

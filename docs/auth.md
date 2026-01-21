# Authentication Setup

## Architecture (JWT + JWKS + Organizations)

```
Google OAuth → Better Auth (D1) → JWT (1h, signed) → LiveStore (org-scoped)
                    │
                    ▼
              /api/auth/jwks (public keys)
                    │
                    ▼
               Worker validates JWT via jose library
                    │
                    ▼
            storeId = org-{claims.orgId}
```

**Components:**
- **Better Auth**: OAuth flow, sessions, JWT issuance via `jwt` + `organization` plugins
- **D1**: Auth tables (user, session, account, verification, jwks, organization, member, invitation)
- **jose**: JWT verification in worker via JWKS
- **LiveStore**: Org-scoped stores via `org-{organizationId}`

---

## Key Files

| File | Purpose |
|------|---------|
| `src/cf-worker/auth.ts` | Better Auth config (jwt + organization plugins) |
| `src/cf-worker/index.ts` | Worker with JWKS + org validation |
| `src/cf-worker/db/schema.ts` | Drizzle schema (auth + org tables) |
| `src/lib/auth.ts` | Auth client (with org plugin) + fetchAuth helper |
| `src/router.tsx` | Router with auth type in context |
| `src/routes/__root.tsx` | beforeLoad auth check + redirect |
| `src/routes/login.tsx` | Login page |
| `src/livestore/store.ts` | useAppStore with JWT from route context |

---

## Auth Flow

### Router-Level Protection (TanStack Router)

Auth is checked in `beforeLoad`, not in render:

```typescript
// src/routes/__root.tsx
export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ location }) => {
    const auth = await fetchAuth()

    if (location.pathname === '/login') {
      return { auth }
    }

    if (!auth.isAuthenticated) {
      throw redirect({ to: '/login' })
    }

    return { auth }
  },
  component: RootComponent,
})
```

**Benefits:**
- Auth checked before render, not during
- No auth checks needed in route components
- Clean separation of concerns

### Sync Connection

LiveStore passes JWT in WebSocket URL:
```
ws://localhost:3000/sync?storeId=org-xxx&payload=%7B%22authToken%22%3A%22eyJ...%22%7D
```

Worker validates JWT and org access:
```typescript
// Fetch JWKS manually (createRemoteJWKSet has issues with self-referential fetch in Workers)
const jwksResponse = await fetch(`${env.BETTER_AUTH_URL}/api/auth/jwks`)
const jwks = await jwksResponse.json()
const JWKS = createLocalJWKSet(jwks)

const { payload: claims } = await jwtVerify(token, JWKS, {
  issuer: env.BETTER_AUTH_URL,
  audience: env.BETTER_AUTH_URL,
})

// Validate org access
const requestedOrgId = context.storeId.replace('org-', '')
if (claims.orgId !== requestedOrgId) {
  throw new Error('Access denied')
}
```

---

## Validation Tested

| Test | Result |
|------|--------|
| Invalid JWT format | `JWSInvalid: JWS Protected Header is invalid` |
| Missing authToken | `["authToken"] is missing` |
| Valid JWT | Connection accepted, scoped to `org-{orgId}` |
| JWT orgId mismatch | `Access denied: not a member of this organization` |

---

## Token Strategy

| Token | Lifetime | Storage | Purpose |
|-------|----------|---------|---------|
| **JWT** | 1 hour | Route context | Sync auth |
| **Session cookie** | 7 days | HttpOnly cookie | Refresh JWT |

**Why both?**
- Cookie = refresh token (get new JWT without re-login)
- JWT = access token (short-lived, for sync)
- Without cookie: user re-logs in every hour

**Alternative (simpler, not implemented):**
- JWT only, stored in localStorage, 7-day expiry
- Less secure (XSS can steal), but simpler
- Acceptable for personal app

---

## Auth State Management

Auth state flows through TanStack Router's context:

```typescript
// src/lib/auth.ts - stateless, just fetches
export const fetchAuth = async (): Promise<AuthState> => {
  const { data: session } = await authClient.getSession()
  const { data: tokenData } = await authClient.token()
  return {
    userId: session?.user?.id,
    orgId: session?.activeOrganizationId,
    jwt: tokenData?.token,
    isAuthenticated: !!tokenData?.token && !!session?.activeOrganizationId,
  }
}

// src/routes/__root.tsx - fetches and puts in context
beforeLoad: async () => {
  const auth = await fetchAuth()
  return { auth }
}

// src/livestore/store.ts - reads from context
export const useAppStore = () => {
  const { auth } = useRouteContext({ strict: false })
  const storeId = `org-${auth.orgId}`
  return useStore({ storeId, syncPayload: { authToken: auth.jwt }, ... })
}
```

**Why route context?**
- `beforeLoad` runs before render, populates context
- Components render only after auth is fetched
- No mutable module variables needed
- `useRouteContext` provides sync access to already-fetched data

---

## Local Development

1. Copy `.dev.vars.example` to `.dev.vars`:
   ```
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   BETTER_AUTH_SECRET=random-32-char-string
   BETTER_AUTH_URL=http://localhost:3000
   ```

2. Apply migrations:
   ```bash
   bun run db:migrate:local
   ```

3. Google OAuth redirect URI:
   ```
   http://localhost:3000/api/auth/callback/google
   ```

4. Run: `bun run dev`

## Production

1. Set secrets:
   ```bash
   wrangler secret put GOOGLE_CLIENT_ID
   wrangler secret put GOOGLE_CLIENT_SECRET
   wrangler secret put BETTER_AUTH_SECRET
   wrangler secret put BETTER_AUTH_URL  # https://your-domain.workers.dev
   ```

2. Apply migrations:
   ```bash
   bun run db:migrate:remote
   ```

3. Google OAuth redirect URI:
   ```
   https://your-domain.workers.dev/api/auth/callback/google
   ```

4. Deploy: `bun run deploy`

---

## Security Checklist

- [x] HttpOnly, Secure, SameSite cookies
- [x] Org-scoped sync partitions (`org-{organizationId}`)
- [x] JWT + JWKS validation (EdDSA, Ed25519)
- [x] Short-lived access tokens (1h)
- [x] Router-level auth (beforeLoad)
- [x] Server-side store access validation (orgId in JWT)
- [ ] Token refresh before expiration
- [ ] Clear local data on logout
- [ ] Handle 401 on reconnect
- [ ] Offline validation (JWKS cached in localStorage)

---

## Organization-Based Store Access

Each user has a personal workspace (organization) created on signup. Store access is controlled via org membership, validated through JWT claims.

### How It Works

```
User signup → Auto-create personal workspace (org) → Store = org-{organizationId}
                                                           ↓
                                              JWT includes activeOrganizationId
                                                           ↓
                                              Worker validates org membership
```

**Benefits:**
- Clear ownership model: org membership = store access
- JWT includes `activeOrganizationId` for stateless validation
- Future multi-user workspaces via org invitations
- Roles (owner/admin/member) for permission control

---

### Flow Diagrams

**New User Signup:**
```
┌──────────┐      ┌─────────────┐      ┌─────────────┐      ┌────────────────┐
│  User    │      │   Google    │      │ Better Auth │      │      D1        │
│ Browser  │      │   OAuth     │      │   Worker    │      │   Database     │
└────┬─────┘      └──────┬──────┘      └──────┬──────┘      └───────┬────────┘
     │                   │                    │                     │
     │ 1. Click "Sign in with Google"         │                     │
     │───────────────────────────────────────►│                     │
     │                   │                    │                     │
     │ 2. Redirect to Google                  │                     │
     │◄───────────────────────────────────────│                     │
     │                   │                    │                     │
     │ 3. Login + consent│                    │                     │
     │──────────────────►│                    │                     │
     │                   │                    │                     │
     │                   │ 4. Callback with code                    │
     │                   │───────────────────►│                     │
     │                   │                    │                     │
     │                   │                    │ 5. INSERT user      │
     │                   │                    │────────────────────►│
     │                   │                    │                     │
     │                   │      ┌─────────────┴─────────────┐       │
     │                   │      │ 6. user.create.after hook │       │
     │                   │      │    → Create personal org  │       │
     │                   │      │    → Add user as owner    │       │
     │                   │      └─────────────┬─────────────┘       │
     │                   │                    │                     │
     │                   │                    │ 7. INSERT org,member│
     │                   │                    │────────────────────►│
     │                   │                    │                     │
     │                   │      ┌─────────────┴─────────────┐       │
     │                   │      │ 8. session.create.before  │       │
     │                   │      │    → Set activeOrgId      │       │
     │                   │      └─────────────┬─────────────┘       │
     │                   │                    │                     │
     │                   │                    │ 9. INSERT session   │
     │                   │                    │   (with activeOrgId)│
     │                   │                    │────────────────────►│
     │                   │                    │                     │
     │ 10. Set session cookie + redirect      │                     │
     │◄───────────────────────────────────────│                     │
```

**Authenticated Sync Connection:**
```
┌──────────┐      ┌─────────────┐      ┌─────────────┐      ┌────────────────┐
│  React   │      │ Better Auth │      │  LiveStore  │      │  SyncBackend   │
│   App    │      │   Client    │      │   Client    │      │      DO        │
└────┬─────┘      └──────┬──────┘      └──────┬──────┘      └───────┬────────┘
     │                   │                    │                     │
     │ 1. beforeLoad: fetchAuth()             │                     │
     │──────────────────►│                    │                     │
     │                   │                    │                     │
     │ 2. getSession() + token()              │                     │
     │◄──────────────────│                    │                     │
     │   { userId, orgId, jwt }               │                     │
     │                   │                    │                     │
     │ 3. useAppStore(storeId=org-{orgId})    │                     │
     │───────────────────────────────────────►│                     │
     │                   │                    │                     │
     │                   │                    │ 4. WebSocket        │
     │                   │                    │    ?storeId=org-xxx │
     │                   │                    │    &payload={jwt}   │
     │                   │                    │────────────────────►│
     │                   │                    │                     │
     │                   │                    │      ┌──────────────┴──────┐
     │                   │                    │      │ 5. validatePayload  │
     │                   │                    │      │    - Verify JWT     │
     │                   │                    │      │    - claims.orgId   │
     │                   │                    │      │      == storeId?    │
     │                   │                    │      └──────────────┬──────┘
     │                   │                    │                     │
     │                   │                    │ 6. Connection OK    │
     │                   │                    │◄────────────────────│
     │                   │                    │                     │
     │ 7. Sync data for org-{orgId}           │◄────────────────────│
     │◄───────────────────────────────────────│                     │
```

---

### Organization Plugin Overview

The plugin adds these tables to D1:

| Table | Purpose |
|-------|---------|
| `organization` | Org name, slug, logo, metadata, createdAt |
| `member` | Links users to orgs with role (owner/admin/member) |
| `invitation` | Pending membership invites with expiration |

Session table extended with:
- `activeOrganizationId` (string, nullable)
- `activeTeamId` (string, nullable, if teams enabled)

**Default roles:**
- `owner` - Full control, can delete org
- `admin` - All permissions except org deletion
- `member` - Read-only access

---

### Implementation Steps

#### 1. Add Organization Plugin

```typescript
// src/cf-worker/auth.ts
import { organization } from 'better-auth/plugins'

export const createAuth = (env: Env, db: Database) => {
  const auth = betterAuth({
    // ... existing config
    plugins: [
      jwt({
        jwt: {
          // Include activeOrganizationId in JWT
          definePayload: async ({ user, session }) => ({
            sub: user.id,
            email: user.email,
            orgId: session.activeOrganizationId,
          }),
          issuer: env.BETTER_AUTH_URL,
          audience: env.BETTER_AUTH_URL,
          expirationTime: '1h',
        },
        jwks: { keyPairConfig: { alg: 'EdDSA', crv: 'Ed25519' } },
      }),
      organization({
        allowUserToCreateOrganization: true,
        creatorRole: 'owner',
      }),
    ],
    databaseHooks: {
      // Auto-create personal workspace on signup (works for OAuth and email/password)
      user: {
        create: {
          after: async (user) => {
            // Create personal organization for new user
            await auth.api.organization.create({
              body: {
                name: `${user.name}'s Workspace`,
                slug: `user-${user.id}`,
              },
              headers: new Headers(),
            })
          },
        },
      },
      // Set active org when session is created
      session: {
        create: {
          before: async (session) => {
            // Find user's first org (personal workspace)
            const membership = await db.query.member.findFirst({
              where: eq(member.userId, session.userId),
            })
            return {
              data: {
                ...session,
                activeOrganizationId: membership?.organizationId ?? null,
              },
            }
          },
        },
      },
    },
  })

  return auth
}
```

**Why `user.create.after`?**
- Fires when user record is created in DB (works for OAuth + email/password)
- Recommended by Better Auth for "new user" logic
- No separate `onSignUp` event exists

#### 2. Update Schema

```typescript
// src/cf-worker/db/schema.ts - add organization tables

export const organization = sqliteTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').unique(),
  logo: text('logo'),
  metadata: text('metadata'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
})

export const member = sqliteTable(
  'member',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // 'owner' | 'admin' | 'member'
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index('member_orgId_idx').on(table.organizationId),
    index('member_userId_idx').on(table.userId),
  ],
)

export const invitation = sqliteTable('invitation', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').notNull(),
  status: text('status').notNull(), // 'pending' | 'accepted' | 'rejected' | 'canceled'
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  inviterId: text('inviter_id').references(() => user.id),
})

// Add activeOrganizationId to session
export const session = sqliteTable('session', {
  // ... existing fields
  activeOrganizationId: text('active_organization_id')
    .references(() => organization.id),
})
```

#### 3. Update Worker Validation

```typescript
// src/cf-worker/index.ts
const validatePayload = async (
  payload: typeof SyncPayload.Type | undefined,
  context: { storeId: string },
  env: Env,
) => {
  if (!payload?.authToken) {
    throw new Error('Missing auth token')
  }

  const jwksResponse = await fetch(`${env.BETTER_AUTH_URL}/api/auth/jwks`)
  if (!jwksResponse.ok) {
    throw new Error(`Failed to fetch JWKS: ${jwksResponse.status}`)
  }
  const jwks = (await jwksResponse.json()) as { keys: JsonWebKey[] }
  const JWKS = createLocalJWKSet(jwks)

  const { payload: claims } = await jwtVerify(payload.authToken, JWKS, {
    issuer: env.BETTER_AUTH_URL,
    audience: env.BETTER_AUTH_URL,
  })

  if (!claims.sub) {
    throw new Error('Invalid token: missing subject')
  }

  // Validate org access from JWT
  const requestedOrgId = context.storeId.replace('org-', '')
  if (claims.orgId !== requestedOrgId) {
    throw new Error('Access denied: not a member of this organization')
  }
}
```

#### 4. Update Client Store ID

```typescript
// src/util/store-id.ts
export const getStoreId = (orgId: string) => `org-${orgId}`

// src/livestore/store.ts
export const useAppStore = () => {
  const { auth } = useRouteContext({ strict: false })

  if (!auth?.isAuthenticated || !auth.orgId || !auth.jwt) {
    throw new Error('useAppStore must be used within an authenticated context')
  }

  const storeId = getStoreId(auth.orgId)
  // ...
}
```

#### 5. Update Auth Client + State

```typescript
// src/lib/auth.ts
import { createAuthClient } from 'better-auth/react'
import { jwtClient, organizationClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [jwtClient(), organizationClient()],
})

export type AuthState = {
  userId: string | null
  orgId: string | null
  jwt: string | null
  isAuthenticated: boolean
}

export const fetchAuth = async (): Promise<AuthState> => {
  const { data: session } = await authClient.getSession()

  if (!session?.user) {
    return { userId: null, orgId: null, jwt: null, isAuthenticated: false }
  }

  const { data: tokenData } = await authClient.token()

  return {
    userId: session.user.id,
    orgId: session.activeOrganizationId ?? null,
    jwt: tokenData?.token ?? null,
    isAuthenticated: !!tokenData?.token && !!session.activeOrganizationId,
  }
}
```

---

### Client API for Organizations

```typescript
// List user's organizations
const { data: orgs } = await authClient.organization.list()

// Switch active organization
await authClient.organization.setActive({ organizationId: 'org-123' })

// Get current active org
const { data: activeOrg } = authClient.useActiveOrganization()

// Invite member (owner/admin only)
await authClient.organization.inviteMember({
  email: 'user@example.com',
  role: 'member',
  organizationId: 'org-123',
})

// Accept invitation
await authClient.organization.acceptInvitation({ invitationId: 'inv-123' })
```

---

### Schema Migration

After adding org tables to `schema.ts`, run Drizzle migrations:

```bash
bun run db:generate        # Generate migration SQL
bun run db:migrate:local   # Apply locally
bun run db:migrate:remote  # Apply to production
```

---

### Validation Approaches Comparison

| Approach | Pros | Cons |
|----------|------|------|
| **JWT orgId (current)** | Stateless, fast validation | Stale if org changes mid-session |
| JWT org list | Multi-org access in one token | JWT bloat, stale memberships |
| DB lookup per request | Always fresh, flexible | Extra query per connection |

**Current approach:** JWT with `activeOrganizationId` for single active workspace. If user switches org, they get a new JWT via `setActive()`.

---

### Known Issues

- **TypeScript inference**: Combining `customSession` + `organization` plugins can cause type issues. Use `satisfies BetterAuthOptions` pattern. See [GitHub #3233](https://github.com/better-auth/better-auth/issues/3233).
- **Session caching**: Cookie cache doesn't include custom session fields. Each `getSession()` call triggers the custom function.

---

## References

- [Better Auth JWT Plugin](https://www.better-auth.com/docs/plugins/jwt)
- [Better Auth Organization Plugin](https://www.better-auth.com/docs/plugins/organization)
- [Better Auth Database Hooks](https://www.better-auth.com/docs/concepts/database#database-hooks)
- [Better Auth Session Management](https://www.better-auth.com/docs/concepts/session-management)
- [jose Library](https://github.com/panva/jose)
- [TanStack Router Auth](https://tanstack.com/router/latest/docs/framework/react/guide/authenticated-routes)
- [LiveStore Auth](https://docs.livestore.dev/patterns/auth/)

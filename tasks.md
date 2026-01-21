# Organization Implementation Tasks

> **Important**: Always check [Better Auth docs](https://www.better-auth.com/docs/plugins/organization) and `docs/auth.md` instead of guessing. Delete this file when done.

## Tasks

- [x] **1. Update schema** - add `organization`, `member`, `invitation` tables + `activeOrganizationId` to session
  - File: `src/cf-worker/db/schema.ts`
  - Reference: `docs/auth.md` section "2. Update Schema"
  - Done: Added organization, member, invitation tables + session.activeOrganizationId + relations

- [x] **2. Update auth.ts** - add organization plugin, databaseHooks, definePayload with orgId
  - File: `src/cf-worker/auth.ts`
  - Reference: `docs/auth.md` section "1. Add Organization Plugin"
  - Done: Added organization plugin, definePayload with orgId, user.create.after + session.create.before hooks

- [x] **3. Update worker validation** - add org access check (claims.orgId vs storeId)
  - File: `src/cf-worker/index.ts`
  - Reference: `docs/auth.md` section "3. Update Worker Validation"
  - Done: Added `claims.orgId !== requestedOrgId` check, removed TODO comment

- [x] **4. Update auth client** - add `organizationClient` plugin, update `fetchAuth` with orgId
  - File: `src/lib/auth.ts`
  - Reference: `docs/auth.md` section "5. Update Auth Client + State"
  - Done: Added organizationClient, AuthState.orgId, fetchAuth returns session.session.activeOrganizationId
  - Also fixed: `src/router.tsx` default auth context

- [x] **5. Update store.ts** - use orgId directly as storeId (no prefix)
  - File: `src/livestore/store.ts`
  - Done: Deleted `getStoreId`, store.ts uses `auth.orgId` directly, worker compares `claims.orgId === context.storeId`

- [x] **6. Generate migration** - `bun run db:generate` + `bun run db:migrate:local`
  - Done: Generated 0002_abnormal_captain_cross.sql, cleared .wrangler/state, applied all migrations

- [x] **7. Test flow** - signup creates org, login sets activeOrgId, sync connects to org-scoped store
  - Done: Created `/api/auth/me` and `/api/org/:id` endpoints, enabled conditional email auth for tests
  - E2E tests verify: user creation with auto-org, session auth, org access control, cross-user isolation
  - All 9 tests passing

---

## E2E Testing Plan (Simplified)

### Goal

Test organization-based auth without LiveStore complexity:
- User can access their own organization data
- User cannot access other organizations
- Unauthenticated requests are rejected

### Approach: Credentials Provider for Testing

**Enable email/password auth in test environment only.**

This is the [recommended approach by Auth.js](https://authjs.dev/guides/testing):
> "OAuth providers are especially difficult to test... Enable an authentication method like the Credentials provider in development mode."

Better Auth doesn't have official test utilities yet ([Issue #5609](https://github.com/better-auth/better-auth/issues/5609)), so credentials for testing is the pragmatic solution.

```typescript
// auth.ts
const auth = betterAuth({
  emailAndPassword: env.ENABLE_TEST_AUTH === 'true'
    ? { enabled: true }
    : undefined,
  socialProviders: {
    google: { ... }  // always available in production
  },
})
```

**Environment setup:**
- Production: `ENABLE_TEST_AUTH` not set → Google OAuth only
- Tests: `ENABLE_TEST_AUTH=true` → email/password signup available

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Vitest + @cloudflare/vitest-pool-workers             │
│                                                                         │
│  Test Setup (beforeAll):                                                │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ 1. SELF.fetch("/api/auth/sign-up/email") → creates user          │   │
│  │    (databaseHooks auto-creates org)                              │   │
│  │ 2. Extract session cookie from Set-Cookie header                 │   │
│  │ 3. SELF.fetch("/api/auth/me") → get orgId                        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  Test Execution:                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ SELF.fetch("/api/auth/me", { headers: { Cookie: sessionCookie }})│   │
│  │ SELF.fetch("/api/org/{id}", { headers: { Cookie: ... }})         │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                         Worker                                   │    │
│  │                                                                  │    │
│  │  ┌─────────────────────────────────────────────────────────┐    │    │
│  │  │                    /api/auth/*                           │    │    │
│  │  │                   (Better Auth)                          │    │    │
│  │  │  • /sign-up/email  (test only, via ENABLE_TEST_AUTH)    │    │    │
│  │  │  • /sign-in/email  (test only)                          │    │    │
│  │  │  • /callback/google (production)                         │    │    │
│  │  └─────────────────────────────────────────────────────────┘    │    │
│  │                              │                                   │    │
│  │  ┌─────────────────┐  ┌─────────────────┐                       │    │
│  │  │ /api/auth/me    │  │ /api/org/:id    │                       │    │
│  │  │ (new endpoint)  │  │ (new endpoint)  │                       │    │
│  │  └────────┬────────┘  └────────┬────────┘                       │    │
│  │           │                    │                                 │    │
│  │           └────────────────────┘                                 │    │
│  │                    │                                             │    │
│  │                    ▼                                             │    │
│  │          ┌─────────────────┐                                    │    │
│  │          │       D1        │                                    │    │
│  │          │   (isolated)    │                                    │    │
│  │          └─────────────────┘                                    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

### New Endpoints to Create

#### 1. `GET /api/auth/me`
Returns current authenticated user with their active organization.

```typescript
// Response
{
  user: { id, name, email },
  session: { activeOrganizationId },
  organization: { id, name, slug } | null
}
```

#### 2. `GET /api/org/:id`
Returns organization details if user is a member.

```typescript
// Response (200 if member)
{ id, name, slug, role }

// Response (403 if not member)
{ error: "Access denied" }
```

### Test Cases

| # | Test | Endpoint | Auth | Expected |
|---|------|----------|------|----------|
| 1 | Unauthenticated /me | GET /api/auth/me | none | 401 |
| 2 | Authenticated /me | GET /api/auth/me | valid cookie | 200 + user data |
| 3 | Own org access | GET /api/org/{myOrgId} | valid cookie | 200 + org data |
| 4 | Other org access | GET /api/org/{otherOrgId} | valid cookie | 403 |
| 5 | Unauthenticated org | GET /api/org/{id} | none | 401 |

### Test Flow (using Effect)

```typescript
// Helper to signup and get session cookie
const signupUser = async (email: string, name: string) => {
  const res = await SELF.fetch('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'test-password-123', name })
  })
  const cookie = res.headers.get('set-cookie') // session cookie

  // Get user info including orgId
  const meRes = await SELF.fetch('/api/auth/me', {
    headers: { Cookie: cookie }
  })
  const me = await meRes.json()

  return { cookie, userId: me.user.id, orgId: me.session.activeOrganizationId }
}

describe('Organization Auth E2E', () => {
  let userA: { cookie: string, userId: string, orgId: string }
  let userB: { cookie: string, userId: string, orgId: string }

  beforeAll(async () => {
    // Create two users via email signup (triggers databaseHooks → auto-creates orgs)
    userA = await signupUser('a@test.com', 'User A')
    userB = await signupUser('b@test.com', 'User B')
  })

  it('User A can access /me', async () => {
    const res = await SELF.fetch('/api/auth/me', {
      headers: { Cookie: userA.cookie }
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.user.id).toBe(userA.userId)
  })

  it('User A can access own org', async () => {
    const res = await SELF.fetch(`/api/org/${userA.orgId}`, {
      headers: { Cookie: userA.cookie }
    })
    expect(res.status).toBe(200)
  })

  it('User A cannot access User B org', async () => {
    const res = await SELF.fetch(`/api/org/${userB.orgId}`, {
      headers: { Cookie: userA.cookie }
    })
    expect(res.status).toBe(403)
  })

  it('Unauthenticated request is rejected', async () => {
    const res = await SELF.fetch('/api/auth/me')
    expect(res.status).toBe(401)
  })
})
```

### Implementation Steps

1. [ ] Enable email/password auth conditionally in `auth.ts`
2. [ ] Create `/api/auth/me` endpoint
3. [ ] Create `/api/org/:id` endpoint
4. [ ] Configure vitest with `ENABLE_TEST_AUTH=true`
5. [ ] Write e2e tests using Effect + SELF
6. [ ] Run tests with vitest-pool-workers

### Files to Modify/Create

```
src/cf-worker/
├── auth.ts               # Add conditional emailAndPassword
├── index.ts              # Add route handling for new endpoints
├── routes/
│   ├── me.ts             # GET /api/auth/me
│   └── org.ts            # GET /api/org/:id
└── __tests__/
    ├── env.d.ts          # cloudflare:test types (exists)
    └── auth.test.ts      # E2E tests using Effect
vitest.config.ts          # Add ENABLE_TEST_AUTH=true binding
```

### Environment Config

```typescript
// vitest.config.ts
export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        miniflare: {
          bindings: {
            ENABLE_TEST_AUTH: 'true',  // Enable email signup in tests
            // ... other test bindings
          },
        },
      },
    },
  },
})
```

# Authentication

Google OAuth via Better Auth with organization-scoped LiveStore sync and admin approval.

## Flow

```
User → Google OAuth → Better Auth → Session Cookie → Approval Check → LiveStore (org-scoped)
```

1. **Signup:** Google OAuth → Better Auth creates personal org → sets `activeOrgId` on session → cookie + redirect
2. **Route protection:** `beforeLoad` in `__root.tsx` checks auth, redirects to `/login` if unauthenticated
3. **Sync connection:** `useAppStore()` → WebSocket `/sync?storeId={orgId}` → server validates session cookie + org membership

## Local Development

For local dev without real Google credentials, use `emulate.dev` (OAuth emulator):

```bash
bun run dev:emulate   # Starts Google OAuth emulator on localhost:4000
```

Set `GOOGLE_BASE_URL=http://localhost:4000` in `.dev.vars`. See README for full setup.

## Session Strategy

Single HttpOnly session cookie, 14 days, sliding window (refreshes after 7 days of activity). Automatically included in same-origin WebSocket connections.

**Unapproved users** see `<PendingApproval />` and never reach LiveStore.

## Session Keep-Alive

- **Visibility refresh:** On tab focus, calls `authClient.getSession()` to extend session and check approval status. Redirects to `/login` if expired.
- **Connection monitor:** When LiveStore sync drops, fetches `/api/sync/auth` for the actual error reason, calls `store.shutdownPromise()` to stop retries, and shows `SyncErrorBanner` with the error code (`SESSION_EXPIRED`, `ACCESS_DENIED`, `UNAPPROVED`, `UNKNOWN`).

## Logout

Currently sets a localStorage flag (`RESET_FLAG_KEY`) and calls `authClient.signOut()`. The flag signals the livestore adapter to reset OPFS on next login. Full OPFS cleanup (clearing while unmounted) is not yet implemented.

## LiveStore Retry & Disconnect Handling

LiveStore now has upstream exponential backoff for WebSocket retries (1s → 30s, jittered, indefinite — [PR #1144](https://github.com/livestorejs/livestore/pull/1144)). Previously we patched this ourselves; the patch is no longer needed.

Auth failures still look identical to network errors at the WebSocket level, so we add:

1. **Pre-flight auth check** at `/api/sync/auth`
2. **Connection monitor** detects disconnect → fetches error reason → `store.shutdownPromise()` stops retries
3. **Error banner** with specific reason (`SESSION_EXPIRED`, `ACCESS_DENIED`, etc.)

## API Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/auth/me` | Current user + org info (200 or 401) |
| `GET /api/sync/auth?storeId={id}` | Pre-flight sync auth check. Returns error code on failure. |
| `GET /api/org/:id` | Org details if user is member (200/403/404) |

## Security Checklist

- [x] HttpOnly, Secure, SameSite cookies
- [x] Org-scoped sync (storeId = organizationId)
- [x] Router-level + server-side auth
- [x] API key rate limiting (100/day via Better Auth)
- [x] Admin approval for new users
- [x] Visibility-based session refresh
- [x] Connection monitoring + graceful shutdown
- [ ] Clear OPFS on logout (currently flag-based only)

## Historical Note: JWT Removal

Previously used short-lived JWTs for sync auth. Removed because: JWT expiry required refresh timers, added complexity (`jose`, JWKS), and cookie auth "just works" with same-origin WebSocket connections. The `jwks` table in D1 can be safely ignored.

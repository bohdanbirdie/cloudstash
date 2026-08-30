# Authentication and Tenancy — Spec

This document specifies authentication and workspace authorization. It builds on
[requirements.md](./requirements.md).

## Status

Active.

## Identity Flow

```text
Google OAuth → Better Auth user → approval → personal organization/workspace
             → session cookie with activeOrganizationId
```

Better Auth persists identity, sessions, API keys, OAuth provider state, and
signing keys in D1. Accounts are keyed by issuer plus account ID. On session
creation, the hook resolves an existing active
organization or creates a personal organization and sets it on the session.
Unapproved users stop before mounting the LiveStore application.

Application entry therefore has three states, not two: awaiting approval,
approved with a workspace, and approved without one. The third is reachable
because the session hook logs and swallows a failed organization create or
membership repair, leaving an approved session with no active organization.
Each state gets its own screen; an approved user without a workspace is never
shown the invite-redemption flow, which cannot resolve it. Because the hook
runs only on session creation, the recovery contract is a new session — a
reload re-reads the same one and returns to the same state. Account deletion
is not offered there: it resolves the personal organization by slug and fails
for an account that never received one.

The Better Auth 1.7 migration maps configured legacy providers to issuers;
database constraints roll back unknown or colliding identities.

Production sessions last fourteen days and update after seven days. A signed
cookie cache has a five-minute TTL. Visibility/focus refresh checks the session;
sync disconnect handling probes `/api/sync/auth`, shuts down a rejected store,
and distinguishes expired, denied, unapproved, and unknown failures.

## Workspace Authorization

Cloudstash uses one authoritative workspace-access decision at content and
credential-minting boundaries. For a browser session it resolves the signed-in
user and active workspace; for an API key it resolves the server-stamped
workspace and referenced user. In both cases it then verifies current account
approval, current workspace membership, and any workspace requested by the
operation. Missing identity, scope, key reference, approval, or membership fails
closed.

Browser LiveStore connections send a payload containing `storeId` and the
same-origin cookie. Both `/api/sync/auth` preflight and the authoritative `/sync`
payload validator use the shared decision. Chat authorization and session-based
integration minting use the same decision, so a revoked member or newly
unapproved user cannot enter those boundaries even while a cached session cookie
still proves identity. The signed cookie cache retains its five-minute identity
tradeoff; approval and membership are read authoritatively when each boundary is
entered. An already-established sync WebSocket does not yet reauthorize or
terminate when approval or membership changes; see
[DELTA-011](../../.delta/DELTA-011-established-sync-connections-do-not-reauthorize.md).

Chrome extension clients authenticate with a paired Better Auth API key and an
allowed `chrome-extension://` origin. The shared payload validator resolves the
key's server-stamped workspace and referenced user, checks their current access,
and fails closed for missing reference, invalid key, revoked access, or
disallowed extension ID.

Public API, Telegram, and Raycast credentials are Better Auth API keys carrying
server-selected workspace metadata. Browser key creation overwrites client
metadata with the caller's authorized active workspace, and generic key updates
cannot mutate metadata. Public reads, ingest, extension sync/account/disconnect,
Raycast exchange, and Telegram source authentication verify the key reference
and its current approval and membership before use. Better Auth's live key
verification preserves next-request/reconnect revocation. Its per-key request
rate limit is disabled because sync reconnects are network-driven; a Cloudflare
per-IP rate limiter protects selected auth/sync paths.

Remote MCP uses Better Auth discovery, DCR, PKCE, refresh tokens, and
five-minute workspace/resource JWTs. Rotating refresh tokens have an explicit
30-day sliding lifetime, so an active client refreshes silently while a client
idle for 30 days must authenticate again. Protected-resource metadata omits its
optional scope list so clients that otherwise treat it as exhaustive fall back
to authorization-server metadata and request `offline_access`; resource scopes
remain advertised there as well. Consent remains bound to its signed query and
workspace across redirects. Each request verifies JWT/DPoP locally and rechecks
access, entitlement, and scope; existing JWTs expire within five minutes.
Google uses fixed endpoints, so auth initialization needs no discovery request.
Local development uses those same endpoints with a registered loopback callback;
there is no alternate Google issuer or base-URL override.

## Roles and Permissions

[`src/lib/permissions.ts`](../../../src/lib/permissions.ts) defines:

| Role   | Dashboard view | Billing manage | Members manage | System manage |
| ------ | -------------- | -------------- | -------------- | ------------- |
| user   | no             | no             | no             | no            |
| viewer | yes            | no             | no             | no            |
| admin  | yes            | yes            | yes            | yes           |

Hono middleware enforces permissions on authoritative routes. Client checks only
hide or reveal controls. Better Auth's admin plugin grants built-in role/user
operations only to `admin`, not `viewer`.

## Pairing Flows

- **Raycast:** a signed-in browser creates a short-lived verification value;
  the separate extension exchanges it for a device-labelled API key. Session
  mint and key exchange both revalidate current workspace access.
- **Chrome:** an externally-connectable handoff route mints a paired key and
  sends it to the installed extension; minting requires current workspace
  access, and the locally stored key is revalidated when used and can be
  remotely revoked.
- **Telegram:** a connection code associates chat identity with a user/workspace
  API key stored through KV mappings. Stored and newly supplied keys use the
  shared workspace decision.
- **X:** an authenticated account-linking OAuth flow stores encrypted provider
  tokens; X does not expose email, so the linked synthetic identity is allowed
  only from an already-authenticated session. X uses provider tokens rather than
  workspace-scoped Better Auth API-key metadata; its status and control routes
  still revalidate the browser session's current workspace access.

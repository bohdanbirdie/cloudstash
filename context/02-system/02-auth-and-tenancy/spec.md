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

Better Auth persists users, OAuth accounts, sessions, organizations, members,
API keys, OAuth provider clients/tokens/consents/resources, and signing keys in
D1. Account identity is keyed by issuer plus account ID, using a discovered
OIDC issuer or Better Auth's synthetic `local:` / `local:oauth:` issuer
namespace. On session creation, the hook resolves an existing active
organization or creates a personal organization and sets it on the session.
Unapproved users stop before mounting the LiveStore application.

The OAuth provider tables persist authorization-server state such as registered
clients, consent, and tokens; they are separate from the per-request stateless
MCP transport. The account issuer column is also separate: it is an
application-wide Better Auth identity requirement. The legacy account migration
maps only the configured credential, Google, and X issuer namespaces. It checks
for other historical providers and duplicate resulting identities before table
replacement, and aborts without changing legacy account data when either is
present.

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

Remote MCP clients use Cloudstash's Better Auth OAuth 2.1 provider. The provider
publishes authorization-server and protected-resource discovery, accepts
unauthenticated dynamic client registration, and uses authorization-code PKCE
plus refresh tokens. Registration is covered by the shared Cloudflare auth-path
limit (30 requests per minute per IP). Better Auth's configured five-per-minute
in-memory endpoint limiter is active in production as a supplemental
single-isolate throttle; it is not the cross-isolate abuse boundary. Consent
binds `links:read` and/or `links:write` to the browser session's active
workspace. Whenever Better Auth redirects an auth flow to the consent screen,
including after a login callback creates a session, the Worker binds that exact
signed `oauth_query` and the then-active workspace in one MAC-authenticated,
ten-minute, HttpOnly consent cookie. An
accepted consent submission must present the matching signed query while the
same workspace remains active; otherwise the Worker clears the cookie and
rejects before Better Auth creates consent or an authorization code. The cookie
is also cleared after a completed consent submission. Access tokens are signed
JWTs with the client, scopes, resource, user, and workspace claim and expire
after five minutes.

This MCP-only DCR surface defaults an omitted OAuth `application_type` to
`native` for legacy MCP JAM compatibility. An explicit client type is preserved,
and Better Auth still rejects redirects that violate that type, including web
loopback redirects and native non-loopback HTTP redirects. This is a temporary
compatibility deviation from OIDC's omitted-value default of `web`, not a general
authorization-server default.

Google sign-in uses fixed authorization, token, UserInfo, account-issuer, and
account-subject configuration instead of fetching OIDC discovery while each
Better Auth context initializes. `GOOGLE_BASE_URL` selects the corresponding
fixed emulator endpoints for local development. Unrelated Cloudstash requests
therefore do not depend on a live Google discovery request.

Every MCP request loads Better Auth's current public signing keys through the
in-process auth API and uses Better Auth core verification to check JWT
signature, issuer, MCP audience, and expiry without an outbound HTTP request to
the Worker's own JWKS route. Bearer and DPoP presentation use the same core DPoP
binding rules, with proof replay reservations stored through Better Auth's
shared database adapter. The Worker then rechecks current user approval,
workspace membership, requested workspace, and the workspace's `mcpServer`
capability. Tool calls additionally require their operation scope. Deleting a
stored consent forces a future authorization to ask again, but Better Auth does
not couple that deletion to existing refresh or access tokens. Revoking a
client or refresh token prevents future token issuance. An already issued JWT
has no online deny-list lookup, so its maximum credential-revocation window is
five minutes. Membership, approval, and entitlement changes still take effect
on the next request.

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
  only from an already-authenticated session. The X provider is registered only
  when both `X_CLIENT_ID` and `X_CLIENT_SECRET` are non-empty; absent or partial
  configuration leaves X unavailable without preventing global auth
  initialization. X uses provider tokens rather than workspace-scoped Better
  Auth API-key metadata; its status and control routes still revalidate the
  browser session's current workspace access.

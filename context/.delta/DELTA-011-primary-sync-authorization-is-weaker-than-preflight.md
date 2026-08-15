# DELTA-011: Workspace authorization differs across stateful boundaries

Status: open

## Divergence

The app's sync preflight rejects unapproved users, but the authoritative `/sync`
validator omits approval and current membership. Chat uses preflight-like auth
that still omits current membership. Raycast pairing checks session/active
workspace but not approval or current membership before minting a key.

## Intent

[CS.SYS.AUTH-R01 and CS.SYS.AUTH-R02](../02-system/02-auth-and-tenancy/requirements.md)
require approval and active membership at every content boundary.

## Implementation

[`auth/sync-auth.ts`](../../src/cf-worker/auth/sync-auth.ts) checks approval but
not membership and is reused by chat.
[`sync/validate-payload.ts`](../../src/cf-worker/sync/validate-payload.ts) checks
only session existence and active-workspace equality for cookie clients.
[`connect/raycast.ts`](../../src/cf-worker/connect/raycast.ts) mints from session
active workspace without approval/membership lookup.

## Direction

update implementation

## Resolution Signal

Delete this delta when one shared authorization decision protects preflight,
`/sync`, chat, and session-based integration minting, verifies approval and
current membership, and tests prove revoked/unapproved sessions cannot mount or
continue workspace sync.

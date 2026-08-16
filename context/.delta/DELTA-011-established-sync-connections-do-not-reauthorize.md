# DELTA-011: Established sync connections do not reauthorize current access

Status: open

## Divergence

Sync preflight and authoritative `/sync` connection establishment verify current
approval and workspace membership. After a WebSocket is accepted, however, the
SyncBackend does not reauthorize that connection when processing later traffic.
A client whose user approval or membership is withdrawn can therefore continue
using an already-established connection until it disconnects or reconnects.

## Intent

[CS.SYS.AUTH-R01 and CS.SYS.AUTH-R02](../02-system/02-auth-and-tenancy/requirements.md)
require authenticated, approved, current-member access to workspace sync.

## Implementation

[`sync/validate-payload.ts`](../../src/cf-worker/sync/validate-payload.ts)
performs the current-access decision before the SyncBackend accepts a connection.
[`sync/index.ts`](../../src/cf-worker/sync/index.ts) then handles traffic on the
accepted connection without a fresh approval or membership decision.

## Direction

update implementation

## Resolution Signal

Delete this delta when established browser-session and extension-key sync
connections are terminated or reauthorized after approval or membership is
withdrawn, and Worker tests prove they cannot continue workspace sync.

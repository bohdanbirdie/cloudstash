# DELTA-042: Established chat connections do not reauthorize user access

Status: open

## Divergence

The Agents route hook verifies the session, current user approval, workspace
membership, and `chatAgent` capability before accepting a WebSocket. Each later
model/tool turn rechecks the workspace capability and atomically reserves its
budget, but it cannot recheck the originating user's approval or membership.
Cloudflare `AIChatAgent.onChatMessage` does not expose that connection or its
server-stamped state, so a user whose access is revoked can continue submitting
turns on an already-open socket while the workspace remains entitled.

## Intent

[CS.SYS.AUTH-R01 and CS.SYS.AUTH-R02](../02-system/02-auth-and-tenancy/requirements.md)
require authenticated, approved, current-member workspace access.
[CS.SYS.BILL-R02](../02-system/08-billing-and-entitlements/requirements.md)
requires paid stateful operations to check capability at the authoritative
boundary.

## Implementation

[`chat-agent/hooks.ts`](../../src/cf-worker/chat-agent/hooks.ts) protects the
initial WebSocket handshake. [`chat-agent/index.ts`](../../src/cf-worker/chat-agent/index.ts)
checks current capability and budget in `onChatMessage`, whose public SDK
arguments do not identify the originating connection. The installed SDK handles
the chat protocol inside its own `onMessage` wrapper before delegating unknown
frames to application code.

## Direction

update implementation

## Resolution Signal

Delete this delta when a supported connection-aware turn boundary reauthorizes
the server-stamped user identity before chat provider/tool work, closes or
rejects revoked connections without inspecting or wrapping installed SDK
internals, and tests prove approval and membership withdrawal stop the next
turn while backend unavailability remains retryable.

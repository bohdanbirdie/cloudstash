# Use Effect RPC for chat library tools

Status: accepted

## Context

Removing the ChatAgentDO LiveStore replica requires a typed boundary to the
workspace-named LinkProcessorDO. The initial implementation used separate
Cloudflare Durable Object methods plus a handwritten client interface and a
custom success/error envelope.

Cloudstash already uses Effect throughout Worker domain code, while LiveStore's
Cloudflare stack provides a public `@livestore/common-cf` adapter that carries
Effect RPC over Cloudflare native Durable Object RPC.

## Evidence and Argument

- `LinkProcessorDO` already owns the workspace-named LiveStore replica and the
  canonical link service used by REST and MCP.
- A second ChatAgentDO replica duplicates event-log materialization and sync
  work for the same library; deleting the local chat actor state after the RPC
  change still leaves chat library tools functional.
- Effect RPC derives both endpoints from one schema-backed group, while the
  `@livestore/common-cf` adapter keeps transport on Cloudflare's direct DO RPC
  path without adding a public network endpoint.
- A real Miniflare DO-to-DO test exercises reads, writes, search, stats, and
  archival across the same boundary used in production.

## Options

| Option                                        | Tradeoff                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Keep a LiveStore replica inside `ChatAgentDO` | Least code movement, but pays for another materialization and couples chat sessions to library sync.   |
| Add handwritten native DO methods for chat    | Uses the canonical owner, but duplicates request, result, and error contracts beside Effect services.  |
| Carry Effect RPC over native DO RPC           | Reuses the canonical owner and typed contracts; accepts an unstable Effect API and a small codec cost. |

## Decision

Define library operations once as an Effect `RpcGroup` with schema-backed
payloads, successes, and tagged errors. Use `@livestore/common-cf` only as the
transport adapter over native Durable Object RPC. `LinkProcessorDO` hosts the
handlers and remains the sole Cloudflare-side library materialization;
`ChatAgentDO` creates a scoped client for tool calls.

Do not copy the transport adapter, add HTTP or WebSocket routing, or expose
LiveStore storage to chat. REST and MCP keep their existing native RPC surface
for this focused change.

## Consequences

- Client and handler types derive from one contract instead of a parallel
  handwritten interface.
- Runtime payload/result validation, typed failures, and tracing follow the
  same Effect conventions as the rest of the Worker.
- Each unary tool operation pays a small MessagePack encode/decode cost. This is
  accepted because it is minor beside model and library work and avoids another
  materialized client.
- The RPC APIs are currently under Effect's unstable namespace. Cloudstash pins
  the same Effect and LiveStore revision, and upgrades must run the real-DO chat
  RPC E2E before changing either side.

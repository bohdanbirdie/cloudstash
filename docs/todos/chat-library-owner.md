# Remove the chat LiveStore replica and route tools through LinkProcessorDO

- Code: `AI-03`
- Priority: high

## Goal

Keep the current one-chat-per-library experience, but stop `ChatAgentDO` from
materializing a second copy of the same LiveStore state. Reuse
`LinkProcessorDO` as the only Cloudflare-side owner of the materialized library
used by ingestion, processing, REST, MCP, digest, and chat tools.

This task does not add multiple chats, a chat registry, or a new storage plane.
That work is split into `AI-09`.

## Current cost and coupling

The browser has its local LiveStore client. In Cloudflare, each library also has
two full clients today:

```text
SyncBackendDO
  ├─ LinkProcessorDO LiveStore client
  │    processing + canonical REST/MCP link RPCs
  └─ ChatAgentDO LiveStore client
       chat tools query and commit the duplicated materialized state directly
```

`ChatAgentDO` calls `createStoreDoPromise({ livePull: true })`, persists a
separate LiveStore session, implements `syncUpdateRpc`, and imports library
queries/events directly. This adds another initial replay/materialization,
SQLite state, live-pull subscription, callback traffic, and warm execution for
every library whose chat actor has been opened.

The duplicate is unnecessary because `LinkProcessorDO` already exposes typed
list/search/get/save/update/batch-update RPCs backed by its cached store and the
shared Effect `WorkspaceLinks` service.

## Target boundary

```text
browser ───────────────────────────────────────► SyncBackendDO

ingestion / REST / MCP / digest / chat tools
                         │
                         ▼
LinkProcessorDO (one named instance per library/org)
  only Cloudflare-side LiveStore client
  canonical library queries and mutations
  processing, notifications, and digest scheduling

ChatAgentDO (one named instance per library for now)
  Agents SDK message history and model execution
  monthly chat usage reservation
  no LiveStore client, queries, events, or sync callback
  Effect RPC client over Cloudflare native DO RPC
```

The chat actor derives the library ID from its existing DO name. It obtains
the matching `env.LINK_PROCESSOR_DO` stub and never receives direct storage or
database access. A shared schema-backed `WorkspaceLinksRpcs` group infers both
client and handler contracts; `@livestore/common-cf` supplies the public native
DO transport adapter already used by the LiveStore Cloudflare stack.

## Tool alignment

Do not copy library logic into chat. Translate the existing AI tool inputs into
the canonical RPC contract:

| Chat behavior                         | LinkProcessorDO operation                                |
| ------------------------------------- | -------------------------------------------------------- |
| recent links / inbox                  | bounded `listLinks`                                      |
| search                                | `searchLinks`                                            |
| inspect one link                      | `getLink`                                                |
| save                                  | `saveLink`, extending its source union with `chat`       |
| complete / unread / archive / restore | `updateLink`                                             |
| batch complete / archive              | `updateLinks`                                            |
| library counts                        | one small canonical stats RPC, not three full list calls |

Archival tools use server-side AI SDK `needsApproval`; denied calls never reach
their executor. Keep reprocessing unavailable to the agent. The AI SDK's
Promise callbacks are transport boundaries; RPC translation, typed failures,
and result mapping remain Effect programs. Remote rejections and canonical
domain failures must not collapse into untyped throws.

Mutating tool calls inherit the canonical RPC durability barrier. This may add
up to the existing five-second sync timeout in a degraded case, but avoids
reporting a mutation that only exists in an evictable client replica.

## Legacy subscription compatibility

LiveStore currently persists DO-RPC subscribers in SyncBackend storage and has
no supported unsubscribe operation. Existing libraries that previously opened
chat may therefore continue calling `ChatAgentDO.syncUpdateRpc` after this
change.

AI-03 does not reach into LiveStore's private `rpc-sub:*` storage and does not
patch `vendor/livestore`. Keep a minimal compatibility `syncUpdateRpc` that
accepts a late callback and returns without decoding the payload, booting a
store, writing storage, or importing LiveStore. New chat actors never register
a subscription.

This leaves one small no-op Durable Object RPC per emitted push chunk for
previously registered chat actors, but removes the materialization, callback
handling, and new subscription cost. `AI-10` owns a supported upstream
unsubscribe operation and eventual removal of this compatibility method.

## Implementation slices

1. Add focused parity tests through Effect's in-memory RPC harness, plus a real
   Miniflare DO-to-DO E2E covering reads, writes, search, stats, and archival.
2. Extend the canonical service/RPC only for the missing `chat` save source and
   a bounded stats read.
3. Replace store-backed chat tools with the Effect-backed LinkProcessorDO client.
4. Remove `createStoreDoPromise`, LiveStore query/event imports, cached Store,
   session creation, commit helpers, and normal sync handling from chat.
5. Retain only a no-op `syncUpdateRpc` compatibility method for callbacks
   registered before this deployment.
6. Add a lint boundary for `src/cf-worker/chat-agent/**` forbidding LiveStore
   client/store imports while allowing the narrow `@livestore/common-cf`
   Effect-RPC transport adapter.

## Verification

- Chat behavior remains one conversation per library with existing message
  history and usage accounting intact.
- All current chat tools have parity through `LinkProcessorDO`; archival
  approval uses server `needsApproval`, and citations still work.
- `ChatAgentDO` does not construct, query, commit, synchronize, or import
  LiveStore.
- A chat opened against a large existing library produces no Chat DO
  materialization writes.
- A library push after the transition does not boot a chat LiveStore client;
  legacy callbacks return without reading or writing Chat DO storage.
- Existing `LinkProcessorDO` processing, API/MCP, digest, and account-deletion
  behavior remains intact.
- `vp check`, focused Worker tests, real-DO E2E, `bun run check:intent`, Worker
  build/upload verification, and `git diff --check` pass.

## Out of scope

- multiple chat sessions or chat-list UI (`AI-09`)
- moving library-wide token accounting out of the current chat actor
- changing the model/provider, prompt, or product entitlement
- exposing reprocessing to chat
- changing LiveStore persistence keys or vendored source
- removing legacy SyncBackend callback registrations (`AI-10`)

## Research references

- [Cloudflare Durable Object class rename and safe rollout](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/)
- [Wrangler Durable Object bindings and legacy `renamed_classes`](https://developers.cloudflare.com/workers/wrangler/configuration/)
- `src/cf-worker/chat-agent/index.ts` — current second store, session, sync
  callback, and usage ownership
- `src/cf-worker/chat-agent/tools.ts` — direct query/event coupling to replace
- `src/cf-worker/link-processor/durable-object.ts` and
  `src/cf-worker/workspace-links/` — existing canonical RPC and Effect service
- `vendor/livestore/packages/@livestore/sync-cf/src/cf-worker/do/transport/do-rpc-server.ts`
  and `do/push.ts` — read-only evidence for persisted callback registration and
  the missing public unsubscribe operation; do not modify these vendored files

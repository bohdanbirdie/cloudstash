# Remove the chat LiveStore replica and route tools through LinkProcessorDO

- Code: `AI-03`
- Priority: high
- Depends on: a supported LiveStore DO-RPC subscription removal operation

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
  thin Effect-backed calls to LinkProcessorDO RPCs
```

The chat actor derives the library ID from its existing DO name. It obtains
`env.LINK_PROCESSOR_DO.getByName(libraryId)` and never receives direct storage or
database access.

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

Keep confirmation behavior for archival tools. Keep reprocessing unavailable to
the agent. The AI SDK's Promise callbacks are transport boundaries; RPC
translation, typed failures, and result mapping remain Effect programs. Remote
rejections and canonical domain failures must not collapse into untyped throws.

Mutating tool calls inherit the canonical RPC durability barrier. This may add
up to the existing five-second sync timeout in a degraded case, but avoids
reporting a mutation that only exists in an evictable client replica.

## Removing the old live-pull subscription

This cannot be implemented safely by only deleting the chat store code.
LiveStore currently persists DO-RPC subscribers in SyncBackend storage, keyed
by the client DO ID, and does not remove that entry when a client store shuts
down. A stale entry would continue to invoke `ChatAgentDO.syncUpdateRpc` on
future library pushes, retaining avoidable DO requests and errors.

Creating a replacement chat DO class does not remove this registration. The
persisted callback contains the old binding/class identity and will keep waking
the old actor until SyncBackend removes it. A new chat class is useful for the
later multi-session identity change, but it is not an unsubscribe mechanism.

Do not read or delete LiveStore's private `rpc-sub:*` storage keys from
Cloudstash. Instead:

1. Add a supported unsubscribe operation upstream in LiveStore's DO-RPC sync
   transport and consume it through a released snapshot; do not patch
   `vendor/livestore` in this app.
2. During the transition, retain a minimal compatibility `syncUpdateRpc` that
   unsubscribes its own callback on the first late delivery and then returns.
3. Also attempt the idempotent unsubscribe when an existing chat actor is next
   opened, so quiet libraries clean up without waiting for a new link event.
4. Remove the compatibility callback only after production evidence shows no
   old chat subscriptions remain, or keep the no-op method if proving global
   absence is not possible. It must not boot a store.

New chat actors never register a LiveStore subscription.

## Implementation slices

1. Add focused parity tests around a fake typed LinkProcessorDO client for every chat
   tool, including confirmations, domain failures, and RPC rejection.
2. Extend the canonical service/RPC only for the missing `chat` save source and
   a bounded stats read.
3. Replace store-backed chat tools with the Effect-backed LinkProcessorDO client.
4. Remove `createStoreDoPromise`, LiveStore query/event imports, cached Store,
   session creation, commit helpers, and normal sync handling from chat.
5. Land the supported upstream unsubscription path and transition existing
   subscribers without app-owned access to LiveStore internals.
6. Add a lint boundary for `src/cf-worker/chat-agent/**` forbidding imports from
   `@livestore/*` and `src/livestore/**` so the replica cannot creep back in.

## Verification

- Chat behavior remains one conversation per library with existing message
  history and usage accounting intact.
- All current chat tools have parity through `LinkProcessorDO`; archival confirmation
  and citations still work.
- `ChatAgentDO` does not construct, query, commit, synchronize, or import
  LiveStore.
- A chat opened against a large existing library produces no Chat DO
  materialization writes.
- A library push after the transition does not boot a chat LiveStore client and its
  legacy callback subscription is removed idempotently.
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

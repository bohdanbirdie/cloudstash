# Remove the chat LiveStore replica and route tools through LibraryDO

- Code: `AI-03`
- Priority: high
- Depends on: a supported LiveStore DO-RPC subscription removal operation

## Goal

Keep the current one-chat-per-library experience, but stop `ChatAgentDO` from
materializing a second copy of the same LiveStore state. Rename
`LinkProcessorDO` to `LibraryDO` and make it the only Cloudflare-side owner of
the materialized library used by ingestion, processing, REST, MCP, digest, and
chat tools.

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
LibraryDO (one named instance per library/org)
  only Cloudflare-side LiveStore client
  canonical library queries and mutations
  processing, notifications, and digest scheduling

ChatAgentDO (one named instance per library for now)
  Agents SDK message history and model execution
  monthly chat usage reservation
  no LiveStore client, queries, events, or sync callback
  thin Effect-backed calls to LibraryDO RPCs
```

The chat actor derives the library ID from its existing DO name. It obtains
`env.LIBRARY_DO.getByName(libraryId)` and never receives direct storage or
database access.

## Tool alignment

Do not copy library logic into chat. Translate the existing AI tool inputs into
the canonical RPC contract:

| Chat behavior                         | LibraryDO operation                                      |
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

## Safe Durable Object rename

Use `LibraryDO` / `LIBRARY_DO`. This is a class and binding rename, not a new
namespace. Follow Cloudflare's alias-first safe rollout as three deployments:

1. Rename the canonical TypeScript class to `LibraryDO`, export it under both
   names, and move callers to the `LIBRARY_DO` binding while that binding still
   targets the exported `LinkProcessorDO` alias. Deploy this first. Existing
   instances continue resolving through the old namespace and the deploy also
   establishes the staging baseline described below.
2. Keep both exports, point `LIBRARY_DO` at `LibraryDO`, and append the legacy
   `renamed_classes: [{ from: "LinkProcessorDO", to: "LibraryDO" }]` migration
   in production and staging. Deploy and certify staging before production.
3. After the rename has fully rolled out, remove the `LinkProcessorDO` export
   alias in a final deploy. Keep the migration history intact.

Never declare `LibraryDO` in `new_sqlite_classes`; that would provision an empty
namespace instead of moving the existing one. Preserve `idFromName(orgId)`,
stored keys, the LiveStore session ID, and its existing client identity during
the rename. Cosmetic storage/protocol renames are separate work.

Cloudflare class rename migrations move the existing namespace and stored data
to the new class. The binding identifier is only the Worker-side reference. The
alias-first rollout prevents the few-second runtime rollout window from finding
a class name that the active Worker version does not export. The project stays
on its supported legacy migration history during this operation rather than
combining the rename with a one-way move to declarative `exports`.

### Local rename drill

Wrangler 4.125.0 / Miniflare does not reproduce Cloudflare's namespace rename
for persisted local DO data. An isolated copy of the largest local replica was
started with the v5 rename and the real `LibraryDO` implementation:

- the old database remained under `cloudstash-LinkProcessorDO` with 11,004
  client events and its original persisted session ID;
- Miniflare created a separate `cloudstash-LibraryDO` database with a new
  session ID;
- waking `LibraryDO` returned the existing library from SyncBackend, but the
  new local replica began replaying from zero (1,007 of 11,004 events had been
  pulled when the probe was stopped).

This is a local-simulator fidelity gap, not the documented production rename
behavior. It proves that existing local `.wrangler/state` will rematerialize
after the class rename; it cannot certify the production namespace move.
Production/staging safety therefore rests on the Cloudflare migration plus a
staging pre/post check of a named object's stored data and session ID. The drill
used only a copied state directory and did not modify the working local state.

### Staging certification

The first alias deployment records a baseline without reading LiveStore's
private schema. On the first store boot for a known staging library, record:

- a cryptographic fingerprint of the app-owned persisted LiveStore session ID;
- a cryptographic fingerprint of the Cloudflare Durable Object ID;
- `reusedSession: true`;
- Cloudflare's generic `ctx.storage.sql.databaseSize` before boot; and
- the number of SQL rows written while the store boots.

After the second deployment applies the class migration, wake the same named
library and compare the same two structured log entries. The rename is accepted
only when both the Durable Object ID and persisted session fingerprints match,
`reusedSession` remains true, the pre-boot database size remains in the
established range, and boot writes remain at the normal warm-restart baseline.
A changed object or session fingerprint, a near-empty pre-boot database, or
replay-sized boot writes means the object was recreated or rematerialized and
blocks the production rename.

Use Workers Logs for the retained record or `wrangler tail --env staging` while
performing the drill. Repeat the same baseline/migration comparison in
production with a known library. These diagnostics use only Cloudflare storage
metadata and Cloudstash-owned keys; they do not depend on LiveStore table names
or other private internals.

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

1. Rename `LinkProcessorDO` to `LibraryDO` through the alias-first,
   namespace-preserving rollout, then update bindings, account deletion,
   queues, sync wakeups, digest, API/MCP, tests, logs, and Intent terminology.
2. Add focused parity tests around a fake typed LibraryDO client for every chat
   tool, including confirmations, domain failures, and RPC rejection.
3. Extend the canonical service/RPC only for the missing `chat` save source and
   a bounded stats read.
4. Replace store-backed chat tools with the Effect-backed LibraryDO client.
5. Remove `createStoreDoPromise`, LiveStore query/event imports, cached Store,
   session creation, commit helpers, and normal sync handling from chat.
6. Land the supported upstream unsubscription path and transition existing
   subscribers without app-owned access to LiveStore internals.
7. Add a lint boundary for `src/cf-worker/chat-agent/**` forbidding imports from
   `@livestore/*` and `src/livestore/**` so the replica cannot creep back in.

## Verification

- Chat behavior remains one conversation per library with existing message
  history and usage accounting intact.
- All current chat tools have parity through `LibraryDO`; archival confirmation
  and citations still work.
- `ChatAgentDO` does not construct, query, commit, synchronize, or import
  LiveStore.
- A chat opened against a large existing library produces no Chat DO
  materialization writes.
- A library push after migration does not boot a chat LiveStore client and its
  legacy callback subscription is removed idempotently.
- Existing `LibraryDO` SQLite data, named IDs, processing, API/MCP, digest, and
  account-deletion tests survive the class rename.
- A staging rename drill records the same pre/post named DO data before the
  production migration.
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

# Simplify LinkProcessorDO wake path — retire the manual onPush trigger

**Status:** Todo (deliberately deferred until the
[[todos/effect-v4-livestore-upstream-migration|effect-v4/upstream migration]]
has soaked in prod). Reviewed 2026-08-10 by a dedicated wake-path analysis on
branch `feat/effect-v4-livestore-upstream`.

## Context

Cloudstash carries a manual wake mechanism from day one of LinkProcessorDO
(commit `bd782fb`, 2026-01-19): `SyncBackendDO.onPush` filters pushes for
`v1.LinkCreated` / `v2.LinkCreated` / `v1.LinkReprocessRequested`
(`src/cf-worker/sync/index.ts:117-122`) and fire-and-forgets a
`triggerLinkProcessor` fetch (`:201-229`, the "Waking up processor" log) at
the LP DO, whose `fetch` handler (`link-processor/durable-object.ts:560-598`)
persists the `storeId` key and runs `ensureSubscribed()`.

It existed because the then-current livestore kept the DO-RPC subscriber
registry in memory — a dead live-pull after eviction meant nobody would wake
the processor (livestorejs#1415). That rationale is now fully solved upstream
(#1541/#1542/#1544/#1545, all on the vendored `main` @ `2e4bcfc68`):

- The registry persists in the SyncBackendDO's **DO KV**
  (`rpc-sub:<clientDoId>` keys, `sync-cf/src/cf-worker/do/transport/do-rpc-server.ts:30-41`),
  reloaded via `kv.list` on every push — survives backend eviction.
- `emitStreamResponse` reconstructs the client stub from the persisted
  binding name + DO id and calls `syncUpdateRpc(payload, storeId)`
  (`common-cf/src/do-rpc/server.ts:225-242`) — cold-starts an evicted LP DO
  with no cloudstash-side help.
- Push appends to the eventlog **before** the broadcast fan-out
  (`cf-worker/do/push.ts:84` vs `:92-194`), so a rebuilt DO's blocking boot
  pull always finds the event even though the delivered chunk itself is
  dropped ("No pull stream queue found", by design per #1544's per-instance
  pull routing).

Live evidence (local session 2026-08-10): one browser push produced both a
manual wake fetch and an RPC delivery racing to perform the identical boot.
Warm and cold re-wake are pure duplication today.

## Why it cannot simply be deleted

1. **First-subscribe bootstrap.** The backend learns a client DO exists only
   from a live pull carrying `rpcContext`. A brand-new workspace whose first
   link comes from the web app has zero `rpc-sub:` entries — the RPC fan-out
   does nothing, and without the manual trigger the pending link is never
   processed. Upstream deliberately leaves first-subscribe to the app.
2. **Deploy transition (one-time, now passed once the migration deploys).**
   The pre-migration fork kept the registry in memory, so at cutover every
   existing org's backend KV starts with no `rpc-sub:` entries; the manual
   trigger backfills the registry on each org's next link push.
3. **Self-heal** if backend storage is ever wiped outside account deletion
   (livestore `resetStore`, a future `PERSISTENCE_FORMAT_VERSION` bump).

Cost of keeping it meanwhile is one redundant DO fetch per link-created push
— the event filter already excludes the pipeline's own status events, and it
is irrelevant to DO-duration billing (the 2026-06-11 incident was
SyncBackendDO WS residency).

## The simplification (when picked up)

Minimal removal diff (described, not applied):

- Delete the `onPush` filter + call (`src/cf-worker/sync/index.ts:117-125`),
  `triggerLinkProcessor` (`:201-229`), the `triggerLinkProcessor` member of
  the `currentSyncBackend` shape (`:96`), and `LinkProcessorDO.fetch`
  (`link-processor/durable-object.ts:560-598`).
- **Prerequisite A:** `syncUpdateRpc` must start persisting the `storeId`
  key — today only fetch/ingest persist it, and the weekly-digest alarm
  fallback reads it (`weekly-digest/scheduler.ts:81-98`).
- **Prerequisite B:** a replacement bootstrap for browser-first workspaces —
  e.g. a one-time LP boot at org creation. Gating `onPush` on "no `rpc-sub:`
  entry" was considered and rejected: it couples cloudstash to livestore's
  private keyspace.

## Proving tests (harness exists)

Use `abortAllDurableObjects` + fresh-stub pattern from
`src/cf-worker/__tests__/e2e/server-ingest-stranding.test.ts`:

1. Boot LP via one `ingestAndProcess` (registers the KV subscription),
   `abortAllDurableObjects()`, push a `v2.LinkCreated` batch to
   `SYNC_BACKEND_DO` with the trigger disabled, assert via a fresh LP stub /
   persisted state that the pending link got processed (cold re-wake works
   without the trigger).
2. Same push against a virgin storeId with the trigger disabled, assert the
   link is never processed — documents the bootstrap hole the replacement
   must close.

## Related

- [[kanban]] item "Account-deletion purge ordering" — purging SyncBackendDO
  first also deletes the `rpc-sub:` entries, closing the resurrection race at
  the registry level; do that swap first or together.
- The outbound-push stranding
  ([[todos/server-ingest-cold-do-stranding|cold-DO stranding]]) is NOT
  addressed by any wake path — both the RPC fan-out and the manual trigger
  are pull-side; LP's own un-pushed backlog still needs the #722
  commit-receipt work.

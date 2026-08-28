# Sync — Spec

This document specifies workspace synchronization. It builds on
[requirements.md](./requirements.md).

## Status

Active.

## Client Topology

```text
web tabs ───── web adapter leader ───────┐
extension ───── extension adapter leader ├─ WebSocket ─► SyncBackendDO
                                         │                    ▲
                                         │                    │ reverse RPC/live pull
LinkProcessorDO ─────── adapter-cloudflare client ──────────────────┤
```

Each store uses the workspace ID. Browser/extension sessions query an in-memory
SQLite state DB and coordinate persistence/sync through their adapter topology.
The server-side LinkProcessor client uses its hosting Durable Object SQLite and
a stable persisted session ID. Chat uses that existing materialization through
Effect RPC instead of opening another sync client.

## Sync Backend

`/sync` is Worker-first. The Worker parses the LiveStore request, authorizes its
payload and workspace, records aggregate usage, and routes to the
workspace-named `SyncBackendDO`. The backend persists accepted event history and
broadcasts live updates. Its `onPush` hook:

- wakes the link processor for link-created/reprocess events;
- mirrors selected lifecycle facts to aggregate D1 activity asynchronously;
- logs a warning when a processor push parent is far behind the backend head.

The backend stores no application materialized link tables; it owns event
ordering/distribution.

## Rebase and Errors

A client commit applies locally and enters the push queue. If the server has
newer events, it rejects the stale parent, live pull supplies the missing prefix,
LiveStore rolls/rebases pending events, and push resumes. Therefore
`ServerAheadError` is expected convergence flow. Materialization errors,
non-contiguous persisted history, silent dead push fibers, or failure to advance
backend history are defects. A confirmed stale multi-tab browser runtime can
currently leave locally committed events in OPFS without advancing backend
history or presenting an actionable sync error; see
[DELTA-041](../../.delta/DELTA-041-stale-browser-leader-can-strand-local-events.md).

## Hibernation

The SyncBackendDO relies on Cloudflare WebSocket Hibernation. Live connection
attachments and RPC subscription registration must be persisted through the
adapter; keep-alive parks must be timerless. The current source includes a
temporary long-timer probe in
[`sync/index.ts`](../../../src/cf-worker/sync/index.ts); removal remains planning
work after production evidence confirms zero hibernation-blocking timers.

## Server-Side Client Recovery

`LinkProcessorDO` implements `syncUpdateRpc(payload, storeId)`. On cold wake it
establishes the workspace ID, single-flights store boot, then hands the payload
to LiveStore's RPC handler. Store creation failure clears the memo so a later
call may retry. Creating concurrent stores over the same DO SQLite is forbidden;
[PR #30](https://github.com/bohdanbirdie/cloudstash/pull/30) records the
corruption this caused.

`ChatAgentDO.syncUpdateRpc` is only a temporary no-op compatibility endpoint for
subscriptions persisted before the chat replica was removed. It never decodes
the payload or boots a store. New chat actors do not subscribe; `AI-10` owns a
supported cleanup path for the legacy registrations.

## Verification

The sync-arrival Worker E2E suite reads `getEventlogMax()` from fresh backend
stubs after single, concurrent, queue-batch, and forced-eviction flows. Event
wire-format goldens protect serialization across LiveStore/Effect revisions.
Bundle verification records a vendored revision marker and targeted runtime
indicators, but does not yet prove complete module provenance; see
[DELTA-038](../../.delta/DELTA-038-bundle-certification-is-indicative-not-provenance-proof.md).

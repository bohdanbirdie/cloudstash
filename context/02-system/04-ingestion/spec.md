# Ingestion — Spec

This document specifies link intake and durability. It builds on
[requirements.md](./requirements.md).

## Status

Active.

## Paths

```text
web app / Chrome extension
  → local LiveStore LinkCreated commit
  → SyncBackendDO onPush
  → LinkProcessorDO wake

POST /api/links / MCP save_link
  → LinkProcessorDO LiveStore commit (link + optional tags)
  → bounded leader-sync barrier
  → SyncBackendDO onPush
  → LinkProcessorDO wake

Telegram / Raycast / POST /api/ingest / X bookmark poll
  → cloudstash-link-queue
  → queue consumer
  → LinkProcessorDO.ingestAndProcess
  → v2.LinkCreated(source, sourceMeta)
  → bounded leader-sync barrier
```

The public API authenticates a Bearer key, resolves its server-stamped `orgId`
and referenced user, verifies current approval and membership, enforces that
workspace's `publicApi`, validates the URL shape, and returns `queued` after
`LINK_QUEUE.send` succeeds. Telegram key authentication uses the same current
workspace-access decision, while X uses source-specific provider authentication
before producing the same `LinkQueueMessage` shape. Raycast uses its paired API
key flow, but shared ingest currently records it as `api` and additionally
requires `publicApi`; see
[DELTA-036](../../.delta/DELTA-036-raycast-capture-loses-source-and-couples-capabilities.md).
The primary `POST /api/links` and MCP `save_link` paths call link-operation RPCs
on the existing LinkProcessorDO, allowing link creation and tags to be one
operation without a second server-side LiveStore replica. They reuse
SyncBackend's existing processor wake and fail if durability is not confirmed
within five seconds. `POST /api/ingest` remains the queue-backed compatibility
path.

## Queue Contract

```ts
{
  url: string;
  storeId: OrgId;
  source: string;
  sourceMeta: string | null;
}
```

At consumption the payload is decoded with Effect Schema. A malformed payload is
non-transient: log and acknowledge. A valid message addresses
`LinkProcessorDO.idFromName(storeId)` and calls `ingestAndProcess`.

Current retry policy, mirrored between code comments and `wrangler.jsonc`:

| Queue                   | Attempts/delay                                                      | Outcome                               |
| ----------------------- | ------------------------------------------------------------------- | ------------------------------------- |
| `cloudstash-link-queue` | five configured retries; 30, 60, 120, 240, 480 seconds              | dead-letter to `cloudstash-link-dlq`  |
| `cloudstash-link-dlq`   | up to 100 retries; hourly through attempt 24, then every four hours | eventual poison drop/retention expiry |

Every DLQ attempt emits `Dead-letter queue re-drive` at error level. The desired
recovery window assumes Paid-plan fourteen-day retention, while Free retention
is fixed at 24 hours. Production plan/retention is not repository-verifiable; see
[DELTA-008](../../.delta/DELTA-008-dlq-retention-requires-remote-reconciliation.md).

## Deduplication and Creation

The processor first checks a deletion tombstone stored inside its own DO
storage. Account purge rewrites the marker after clearing LiveStore state, so
delayed Queue/DLQ messages and external link-operation RPCs cannot recreate
Vault events. Canonical REST/MCP writes recheck their store generation at the
repository commit boundary. A queue-ingest or processing operation already in
flight at deletion time can still retain a stale store handle; see
[DELTA-003](../../.delta/DELTA-003-account-deletion-order-can-rehydrate-client.md).
The processor then boots one LiveStore client, ensures the processing
subscription, and runs `ingestLink`.
The link URL unique index and conflict-ignoring `LinkCreated` materializer make
replay idempotent. A genuinely new external save uses `v2.LinkCreated`; old
`v1.LinkCreated` remains replayable.

## Durability Boundary

A server-side `store.commit()` is only a local client commit. After a new link is
created, the processor captures that commit's session sequence target.
`whenLeaderSynced` waits for the session to hand off that target, captures the
leader's resulting local target, and then waits for the leader's upstream head
to confirm that target in the SyncBackendDO eventlog. Barriers are serialized
per store so concurrent waiters do not split updates. The wait is capped at ten
seconds. Timeout logs a structured warning and currently returns the ingest
result rather than throwing.

The reactive processing promise is passed to `ctx.waitUntil`; when processing
finishes it runs the same bounded barrier for metadata/summary/status events.
[PR #85](https://github.com/bohdanbirdie/cloudstash/pull/85) and forced-eviction
E2E tests provide the implementation evidence. Whether timeout should fail
closed is [CS-DQ2](../../open-questions.md).

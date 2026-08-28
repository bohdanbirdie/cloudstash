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
  → LibraryDO wake

POST /api/links / MCP save_link
  → LibraryDO LiveStore candidate commit
  → bounded leader-sync barrier + canonical URL-winner resolution
  → optional tags + processing-ready commit on the winning link
  → SyncBackendDO onPush
  → LibraryDO wake

Telegram / Raycast / POST /api/ingest / X bookmark poll
  → cloudstash-link-queue
  → queue consumer
  → LibraryDO.ingestAndProcess
  → v2.LinkCreated(source, sourceMeta)
  → bounded leader-sync barrier
```

The public intake authenticates a Bearer key, resolves its server-stamped
`orgId`, source, and referenced user, and verifies current approval and
membership. Ordinary API keys require `publicApi` and emit `source: api`;
Raycast-paired keys require `integrations` and emit `source: raycast`. Both
validate the URL shape and return `queued` only after `LINK_QUEUE.send`
succeeds. Telegram key authentication uses the same current workspace-access
decision plus a fresh `integrations` check, while X uses source-specific
provider authentication before producing the same `LinkQueueMessage` shape.
The primary `POST /api/links` and MCP `save_link` paths call link-operation RPCs
on the existing LibraryDO without a second server-side LiveStore replica.
A new save first makes its URL candidate durable, re-resolves the canonical row
after any concurrent-client rebase, and only then attaches requested tags and
marks the winning row ready for processing. Losing IDs therefore receive no tag
or enrichment events. Retrying an interrupted save for the same URL repairs the
processing-ready marker after the same canonical-winner check. They reuse
SyncBackend's existing processor wake and fail if save durability is not
confirmed within five seconds.
`POST /api/ingest` remains the queue-backed compatibility path.

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
`LibraryDO.idFromName(storeId)` and calls `ingestAndProcess`.

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

The processor first checks its generic terminal actor marker. Retirement
persists that marker before graceful LiveStore shutdown, then clears storage
while retaining the marker, so a failed shutdown, delayed Queue/DLQ message, or
external link-operation RPC cannot recreate library events.
Canonical REST/MCP writes receive the same revision-guarded commit capability
as ingestion, processing, and digest persistence; business services do not
receive lifecycle predicates. A provider notification already in flight at
retirement can still complete; see
[DELTA-003](../../.delta/DELTA-003-account-deletion-order-can-rehydrate-client.md).
The processor then boots one LiveStore client, ensures the processing
subscription, and runs `ingestLink`.
The link URL unique index and conflict-ignoring `LinkCreated` materializer make
replay idempotent. REST/MCP processing waits for the post-sync canonical URL
winner; shared tags are created once per batch and attached only to selected
winning rows. A genuinely new external save uses `v2.LinkCreated`; old
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

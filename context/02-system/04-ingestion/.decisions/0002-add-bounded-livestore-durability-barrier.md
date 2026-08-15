# Add a bounded LiveStore durability barrier to server ingestion

Status: accepted

## Context

A cold LinkProcessorDO could commit a link locally, return to the queue
consumer, and be evicted before LiveStore's fire-and-forget push reached the
SyncBackendDO. The queue message was acknowledged while the link remained
stranded until another ingest woke the client.

## Evidence and Argument

- [PR #81](https://github.com/bohdanbirdie/cloudstash/pull/81) records the
  production symptom and an eviction reproduction.
- [PR #83](https://github.com/bohdanbirdie/cloudstash/pull/83) distinguishes
  eventual event arrival from durability at RPC return.
- [PR #85](https://github.com/bohdanbirdie/cloudstash/pull/85) implements the
  session-to-leader barrier and enables cold-eviction, follow-on processing, and
  sequential-ingest regressions.
- `ctx.waitUntil` is required for processing triggered by a reactive callback;
  returning an untracked Promise is not a Durable Object lifetime guarantee.

## Options

| Option                                                                                                               | Tradeoffs                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Return immediately after local commit and rely on the next wake                                                      | Lowest latency, but acknowledges queue work before persistence and strands cold-DO events.                                    |
| Wait for the full metadata/AI pipeline                                                                               | Strong end-to-end completion, but couples intake to slow/fallible enrichment and exceeds useful request latency.              |
| Wait only for admitted LiveStore events to reach the leader, with a bounded timeout; track follow-on work separately | Protects the save boundary without blocking on enrichment, but timeout currently weakens strict proof of backend persistence. |

## Decision

Run a serialized session-to-leader barrier after new server-side link creation
and after tracked follow-on processing. Bound each wait at ten seconds, emit a
structured warning on timeout, and preserve current availability behavior.
Revisit fail-closed timeout semantics through CS-DQ2 when production evidence is
available.

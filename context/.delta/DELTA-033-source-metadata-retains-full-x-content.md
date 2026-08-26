# DELTA-033: Source metadata retains full X post content

Status: open

## Divergence

X capture serializes author ID, full post text, and provider timestamp into
`sourceMeta`, which becomes part of the durable LinkCreated event history. That
exceeds the ontology's notification/provenance purpose and cannot be removed by
ordinary materialized-state cleanup.

## Intent

[CS.PROD-R03](../01-product/requirements.md) and
[CS-R21](../requirements.md) require minimum durable source metadata for
feedback/provenance.

## Implementation

[`x-sync/poll.ts`](../../src/cf-worker/x-sync/poll.ts) places `text`,
`authorId`, `createdAt`, and tweet ID into Queue `sourceMeta`; ingestion commits
that string in `v2.LinkCreated` and materializes it on the link row.

## Direction

update implementation

## Resolution Signal

Delete this delta when new X events retain only approved necessary provenance,
all consumers tolerate the reduced shape, privacy/export/deletion treatment for
already-deployed history is documented, and compatibility tests preserve old
event replay.

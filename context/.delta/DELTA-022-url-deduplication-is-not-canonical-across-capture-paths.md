# DELTA-022: URL deduplication is not canonical across capture paths

Status: open

## Divergence

Materialized uniqueness is exact string equality, while web and external capture
paths do not share one canonical URL normalization function. Equivalent forms
such as a root URL with and without trailing slash can produce separate links.

## Intent

[CS.SYS.DATA-R07](../02-system/01-data/requirements.md) requires one normalized
URL to have at most one visible row.

## Implementation

Web capture normalizes through `URL.href` and a local comparison in
[`add-link.tsx`](../../src/components/add-link.tsx). Queue ingestion compares and
stores its input string in
[`link-processor/do-programs.ts`](../../src/cf-worker/link-processor/do-programs.ts).
The [`links`](../../src/livestore/schema.ts) unique index compares exact text.

## Direction

update implementation

## Resolution Signal

Delete this delta when every LinkCreated producer and duplicate lookup uses one
versioned canonicalization rule, existing duplicate reconciliation is planned
without breaking event replay, and cross-source normalization tests pass.

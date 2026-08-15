# DELTA-029: Sync lag tripwire can inspect another workspace backend

Status: open

## Divergence

A module-global variable stores the most recently constructed SyncBackendDO.
When multiple workspace objects share an isolate, an `onPush` callback can read
that other object's eventlog head, producing a false or missed processor-lag
warning. Processor/activity routing still receives the callback's explicit
`storeId`; the confirmed cross-object defect is the tripwire evidence.

## Intent

[CS.OPS-R06](../03-operations/requirements.md) requires sync-lag tripwires to be
queryable and trustworthy enough to direct recovery.

## Implementation

[`sync/index.ts`](../../src/cf-worker/sync/index.ts) assigns every constructor to
`currentSyncBackend`, and static `onPush` uses that global object's
`getEventlogMax()` rather than an instance tied to the callback workspace.

## Direction

update implementation

## Resolution Signal

Delete this delta when push consequences and eventlog inspection are bound to
the exact Durable Object instance/workspace with a multi-workspace same-isolate
test proving warnings cannot cross partitions.

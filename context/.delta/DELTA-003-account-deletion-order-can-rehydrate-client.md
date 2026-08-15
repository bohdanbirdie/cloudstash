# DELTA-003: Account deletion can rehydrate purged workspace content

Status: open

## Divergence

The deletion workflow wipes the LinkProcessorDO before the SyncBackendDO. A
late reverse-RPC/live-pull delivery from the still-live sync backend can wake and
reconstruct the client after its storage was purged. The workflow's intake
marker is stored inside LinkProcessorDO and erased by the same `deleteAll()`, so
a retained Queue/DLQ message can also recreate state during or after deletion.

## Intent

[CS.SYS.LIFE-R07 and CS.SYS.LIFE-R08](../02-system/09-account-lifecycle/requirements.md)
require an external intake fence and purge ordering that prevent surviving
sources/messages from recreating deleted state.

## Implementation

[`runAccountDeletion`](../../src/cf-worker/account-deletion/workflow.ts) orders
`wipe-link-processor` before `wipe-sync-backend`.
[`deletion-tombstone.ts`](../../src/cf-worker/link-processor/deletion-tombstone.ts)
explicitly says `ctx.storage.deleteAll()` clears the marker, and
[`purgeAll`](../../src/cf-worker/link-processor/durable-object.ts) performs that
wipe. Later intake checks only the now-absent marker before booting LiveStore.

## Direction

update implementation

## Resolution Signal

Delete this delta when a deletion ledger outside purged client storage fences
intake for at least the retained-message window, the sync backend is disabled
before dependent clients are purged, and eviction plus delayed-Queue tests prove
no workspace content store reappears during or after deletion.

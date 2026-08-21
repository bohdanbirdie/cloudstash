# DELTA-003: In-flight work can outlive workspace purge

Status: open

## Divergence

Canonical REST/MCP link operations are generation-fenced through store creation
and the repository commit boundary. Subscription callbacks are also
generation-gated and disposed during deletion. Pre-existing ingestion,
processing, digest, and result-notification work can still capture the store,
suspend, and resume after account deletion has purged it.

## Intent

[CS.SYS.LIFE-R07 and CS.SYS.LIFE-R08](../02-system/09-account-lifecycle/requirements.md)
require an external intake fence and purge ordering that prevent surviving
sources/messages from recreating deleted state.

## Implementation

[`deletion-tombstone.ts`](../../src/cf-worker/link-processor/deletion-tombstone.ts)
defines the marker retained by
[`purgeAll`](../../src/cf-worker/link-processor/durable-object.ts). Queue intake,
link-operation RPCs, fetch wake-ups, digest triggers, and `syncUpdateRpc` check
the fence at entry. Link-operation RPCs additionally capture `storeGeneration`,
reject store creation from an invalidated generation, and pass a generation
check to every repository commit. Subscription callbacks capture the generation
and are unsubscribed by `markDeleting`. The older processing, digest, ingest,
and notification effects do not yet share that commit fence or an in-flight
drain.

## Direction

update implementation

## Resolution Signal

Delete this delta when mark/purge invalidates or drains the remaining older
operation paths and race tests prove suspended processing, digest, ingestion,
and notification work cannot write after the wipe.

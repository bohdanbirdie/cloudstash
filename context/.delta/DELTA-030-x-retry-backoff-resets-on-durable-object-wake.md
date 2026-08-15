# DELTA-030: X retry backoff resets on Durable Object wake

Status: open

## Divergence

The X polling retry attempt counter exists only in JavaScript memory. Normal
eviction between alarms resets it, so repeated provider failures can remain near
the base delay instead of progressing to the bounded maximum.

## Intent

[CS.SYS-R05](../02-system/requirements.md) and
[CS.OPS-C02](../03-operations/requirements.md) require scheduled recovery state
to survive ordinary eviction.

## Implementation

[`x-sync/durable-object.ts`](../../src/cf-worker/x-sync/durable-object.ts)
initializes `retryAttempt` in memory, increments it when scheduling failures, and
does not persist/reconstruct it from storage.

## Direction

update implementation

## Resolution Signal

Delete this delta when retry state is persisted or the backoff is otherwise
computed durably, success resets it, and forced-wake tests prove consecutive
failures progress to and remain within the intended cap.

# DELTA-012: X watermark advances after bookmark enqueue failure

Status: open

## Divergence

X polling converts individual Queue-send failures into successful log effects and
then advances the watermark. A failed bookmark is therefore skipped permanently
on later polls.

## Intent

[CS.SYS.INT-R09](../02-system/07-integrations/requirements.md) requires watermark
advancement only after successful enqueue of every newly observed bookmark.

## Implementation

[`x-sync/effects.ts`](../../src/cf-worker/x-sync/effects.ts) catches
`XSyncSideEffectError` around each Queue send, returns from the enqueue stage,
and then calls `setWatermark(newestId)` unconditionally.

## Direction

update implementation

## Resolution Signal

Delete this delta when any enqueue failure fails the poll, leaves the prior
watermark intact, and a multi-bookmark test proves one failed send is retried
without duplicating or skipping successfully queued bookmarks.

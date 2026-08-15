# DELTA-018: Required background consequences are eviction-sensitive

Status: open

## Divergence

After a browser LiveStore push, the required processor wake is started in a
detached Effect fiber and is neither awaited nor registered with `waitUntil`.
LinkProcessor terminal notification, stale cancellation, and digest-scheduling
work also has detached paths. Isolate eviction can preserve accepted events while
dropping required recovery/processing consequences. D1 activity is intentionally
best-effort and is not itself the correctness violation.

## Intent

[CS.OPS-C02 and CS.OPS-R09](../03-operations/requirements.md) require correctness
under ordinary eviction and durable-link preservation through degraded
consequences.

## Implementation

[`sync/index.ts`](../../src/cf-worker/sync/index.ts) invokes a non-awaited
processor trigger that uses `Effect.runFork`.
[`link-processor/durable-object.ts`](../../src/cf-worker/link-processor/durable-object.ts)
starts terminal notification, stale cancellation, and digest scheduling without
consistently attaching them to `ctx.waitUntil`. Current E2E does not force
immediate eviction across each handoff.

## Direction

update implementation

## Resolution Signal

Delete this delta when every required consequence is awaited, attached to
execution lifetime, or durably rediscoverable, and forced-eviction tests prove
browser processing wake, terminal notification state, stale cancellation, and
digest scheduling recover without manual invocation.

# DELTA-003: In-flight work can outlive workspace purge

Status: open

## Divergence

Canonical REST/MCP, ingestion, processing, chat-tool, and digest writes are
revision-fenced at injected commit boundaries. Subscription callbacks are also
revision-gated and disposed during actor retirement. Provider notifications can
still start before retirement and complete afterward.

## Intent

[CS.SYS.LIFE-R07 and CS.SYS.LIFE-R08](../02-system/09-account-lifecycle/requirements.md)
require owner tombstones and purge ordering that prevent surviving
sources/messages from recreating deleted state.

## Implementation

[`durable-object-retirement.ts`](../../src/cf-worker/durable-object-retirement.ts)
defines an opaque terminal actor marker retained by `retire`. Queue intake,
link-operation RPCs, fetch wake-ups, digest triggers, and reverse sync route
through the deterministic owner. LinkProcessor invalidates store creation and
injects a revision-guarded commit capability into repositories, workspace
operations, and digest persistence. Subscription callbacks capture the same
revision and are disposed by retirement. Provider notification effects do not
yet have an in-flight cancellation boundary.

## Direction

update implementation

## Resolution Signal

Delete this delta when provider notification work is invalidated or drained and
race tests prove suspended operations cannot cause post-deletion side effects.

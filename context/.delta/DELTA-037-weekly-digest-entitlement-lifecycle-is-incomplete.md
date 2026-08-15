# DELTA-037: Weekly digest entitlement lifecycle is incomplete

Status: open

## Divergence

Alarm setup/execution checks `weeklyDigest`, but manual generation does not. An
already-warm LinkProcessor returns before reconsidering alarm setup, so a
Free-to-Plus transition has no explicit activation signal.

## Intent

[CS.SYS.BILL-R02](../02-system/08-billing-and-entitlements/requirements.md)
requires request/operation-time capability checks, including stateful lifecycle
changes.

## Implementation

[`weekly-digest/scheduler.ts`](../../src/cf-worker/weekly-digest/scheduler.ts)
checks capability in `ensureScheduled` and alarm handling but not
`triggerDigest`. [`link-processor/durable-object.ts`](../../src/cf-worker/link-processor/durable-object.ts)
invokes scheduling during initial subscription setup and can return early for an
already-initialized processor.

## Direction

update implementation

## Resolution Signal

Delete this delta when manual generation is explicitly admin-only or capability
gated as documented, tier/override transitions reconcile alarms immediately,
and warm/cold upgrade/downgrade tests prove the lifecycle.

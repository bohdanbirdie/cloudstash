# DELTA-019: Deletion target failures and surfaces are incomplete

Status: open

## Divergence

The Workflow can report successful X purge after alarm/storage deletion fails,
and its target list omits Stripe subscription cancellation, D1 activity and
verification rows, enrichment KV, Analytics Engine retention, Queue/DLQ residue,
Workflow payload/history retention, and local browser/extension semantics.

## Intent

[CS.SYS.LIFE-R06, CS.SYS.LIFE-R09, and CS.SYS.LIFE-R11](../02-system/09-account-lifecycle/requirements.md)
require a complete per-surface treatment and failure propagation.

## Implementation

[`x-sync/durable-object.ts`](../../src/cf-worker/x-sync/durable-object.ts) catches
`deleteAlarm` and `deleteAll` failures as success. The [workflow](../../src/cf-worker/account-deletion/workflow.ts) has no steps
for the other listed stores or Stripe. [`db/schema.ts`](../../src/cf-worker/db/schema.ts)
defines non-cascading activity/verification rows, while
[`workflows/account-deletion.ts`](../../src/cf-worker/workflows/account-deletion.ts)
serializes IDs into retained Workflow state. Current deletion E2E primarily
asserts Workflow/D1 completion rather than seeded multi-owner purge.

## Direction

update implementation

## Resolution Signal

Delete this delta when every surface has an explicit purge/revocation/TTL rule,
selective targets are implemented, all target failures reject their Workflow
step, and seeded failure-injection E2E proves retry and final absence.

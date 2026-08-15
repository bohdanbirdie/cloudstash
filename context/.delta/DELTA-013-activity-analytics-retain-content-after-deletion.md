# DELTA-013: Activity analytics retain content-linked data after deletion

Status: open

## Divergence

D1 activity rows store workspace IDs, link IDs, source, and domain metadata. The
table has no organization foreign key and account deletion does not remove its
rows. Analytics Engine also receives stable user/workspace indexes without a
documented selective-deletion or retention contract.

## Intent

[CS-R19](../requirements.md),
[CS.OPS-R07](../03-operations/requirements.md), and
[CS.SYS.LIFE-R11](../02-system/09-account-lifecycle/requirements.md) prohibit
content-bearing aggregate telemetry and require explicit cleanup/retention.

## Implementation

[`sync/activity.ts`](../../src/cf-worker/sync/activity.ts) copies link IDs and
domains. [`db/schema.ts`](../../src/cf-worker/db/schema.ts) defines
`activity_events` without FKs. The
[deletion workflow](../../src/cf-worker/account-deletion/workflow.ts) deletes no
activity rows, while [`analytics.ts`](../../src/cf-worker/analytics.ts) writes
stable indexes to Analytics Engine.

## Direction

update implementation

## Resolution Signal

Delete this delta when content identifiers/domains are removed or explicitly
approved, D1 activity is purged during account deletion with tests, and
Analytics Engine fields, retention, access, and deletion limitations are
truthfully documented in Intent and legal surfaces.

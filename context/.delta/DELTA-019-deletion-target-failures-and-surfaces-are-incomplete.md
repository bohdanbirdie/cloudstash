# DELTA-019: Deletion target failures and surfaces are incomplete

Status: open

## Divergence

The Workflow now propagates X purge failures and covers Stripe subscription
cancellation, D1 activity, enrichment KV, and owner-local Queue/DLQ fencing.
Its target
classification still omits attributable generic
verification rows, Analytics Engine retention, and local browser/extension
semantics.

## Intent

[CS.SYS.LIFE-R06, CS.SYS.LIFE-R09, and CS.SYS.LIFE-R11](../02-system/09-account-lifecycle/requirements.md)
require a complete per-surface treatment and failure propagation.

## Implementation

[`x-sync/durable-object.ts`](../../src/cf-worker/x-sync/durable-object.ts)
reconciles missing D1 authority into cancelled alarms and empty local state;
disconnect failures propagate. The [workflow](../../src/cf-worker/account-deletion/workflow.ts)
implements the listed selective targets except generic verification. The
Workflow payload snapshots raw target IDs; Cloudflare retains that operational
history for its bounded instance-retention window. Generic terminal actor state
makes delayed Link/DLQ intake a no-op; X reconciliation derives the same outcome
from its missing Better Auth account.
Deletion E2E seeds every owned Durable Object/KV target and D1 activity. It does
not yet inject provider failures or suspend work across a retirement boundary.

## Direction

update implementation

## Resolution Signal

Delete this delta when every surface has an explicit purge/revocation/TTL rule,
selective targets are implemented, all target failures reject their Workflow
step, and seeded failure-injection E2E proves retry and final absence.

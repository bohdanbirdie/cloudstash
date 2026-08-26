# DELTA-015: Ongoing integrations bypass entitlement rechecks

Status: open

## Divergence

Telegram connection is capability-gated, but later bot captures only verify the
retained API key. Existing bot capture can therefore continue after downgrade.

## Intent

[CS.SYS.INT-R05](../02-system/07-integrations/requirements.md) and
[CS.SYS.BILL-R02](../02-system/08-billing-and-entitlements/requirements.md)
require authoritative operation-time checks and downgrade self-healing.

## Implementation

[`telegram/services/source-auth.live.ts`](../../src/cf-worker/telegram/services/source-auth.live.ts)
verifies key metadata without a capability lookup. X reconciliation now checks
the bound workspace capability after OAuth completion, after lifecycle signals,
and before alarm provider work.

## Direction

update implementation

## Resolution Signal

Delete this delta when every Telegram capture checks the current workspace
capability, downgrade revokes or suspends retained integration state, and tests
cover tier and override transitions while already connected.

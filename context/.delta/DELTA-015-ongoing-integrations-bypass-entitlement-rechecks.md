# DELTA-015: Ongoing integrations bypass entitlement rechecks

Status: open

## Divergence

Telegram connection is capability-gated, but later bot captures only verify the
retained API key. X direct account linking and alarm polling do not consistently
check `xBookmarkSync`, so existing polling/capture can continue after downgrade.

## Intent

[CS.SYS.INT-R05](../02-system/07-integrations/requirements.md) and
[CS.SYS.BILL-R02](../02-system/08-billing-and-entitlements/requirements.md)
require authoritative operation-time checks and downgrade self-healing.

## Implementation

[`telegram/services/source-auth.live.ts`](../../src/cf-worker/telegram/services/source-auth.live.ts)
verifies key metadata without a capability lookup. X account hooks start the DO,
and [`x-sync/durable-object.ts`](../../src/cf-worker/x-sync/durable-object.ts)
polls from alarms without resolving current billing capability; only selected
resume/connect handlers gate it.

## Direction

update implementation

## Resolution Signal

Delete this delta when every Telegram capture and X link/poll operation checks
the current workspace capability, downgrade revokes or purges durable integration
state, and tests cover tier and override transitions while already connected.

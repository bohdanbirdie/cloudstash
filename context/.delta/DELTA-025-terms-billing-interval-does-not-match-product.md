# DELTA-025: Terms describe monthly-only billing despite annual plans

Status: open

## Divergence

Executable plan and checkout code support monthly and annual paid intervals,
while the Terms say paid plans bill monthly in advance. Production annual Stripe
Price/Portal configuration is also not repository-verifiable.

## Intent

[CS.PROD-C02](../01-product/requirements.md) and
[CS.SYS.BILL-R08](../02-system/08-billing-and-entitlements/requirements.md)
require truthful price/interval claims and mapping.

## Implementation

[`plan.ts`](../../src/lib/plan.ts) declares annual Plus/Pro prices and billing
code maps yearly IDs. [`terms.tsx`](../../src/routes/terms.tsx) states monthly
billing. Annual Stripe resources remain external configuration checked only when
credentials are available.

## Direction

update implementation

## Resolution Signal

Delete this delta when Terms cover monthly and annual billing semantics and a
dated production pricing/Portal reconciliation proves every advertised annual
plan is purchasable/manageable at the executable amount.

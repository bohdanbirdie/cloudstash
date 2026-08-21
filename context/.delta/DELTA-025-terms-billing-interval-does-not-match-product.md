# DELTA-025: Production annual billing remains unverified

Status: open

## Divergence

Executable plan, checkout code, and Terms support monthly and annual paid
intervals. Production annual Stripe Price/Portal configuration remains external
state that has not been verified with maintainer credentials.

## Intent

[CS.PROD-C02](../01-product/requirements.md) and
[CS.SYS.BILL-R08](../02-system/08-billing-and-entitlements/requirements.md)
require truthful price/interval claims and mapping.

## Implementation

[`plan.ts`](../../src/lib/plan.ts) declares annual Plus/Pro prices, billing code
maps yearly IDs, and [`terms.tsx`](../../src/routes/terms.tsx) describes both
intervals. Annual Stripe resources remain external configuration checked only
when credentials are available.

## Direction

update Intent

## Resolution Signal

Delete this delta when a dated production pricing/Portal reconciliation proves
every advertised annual plan is purchasable and manageable at the executable
amount.

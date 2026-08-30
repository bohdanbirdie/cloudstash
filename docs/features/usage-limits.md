# Usage limits

Cloudstash uses workspace-period allowances for bounded AI operations. These
allowances do not limit how many links a workspace may save.

## Current implementation

- Pro chat includes the monthly Assistant credits configured by
  `monthlyAssistantCredits` in `src/lib/plan.ts`. `LinkProcessorDO` checks its
  monthly settled-cost aggregate before provider work, then atomically appends
  the completed run and updates the aggregate from OpenRouter's reported cost.
  The private monthly limit maps this aggregate to public credits; missing
  metering configuration denies model work.
  The reset follows the workspace entitlement: exact Stripe item periods for
  monthly plans, monthly subwindows derived from Stripe's billing anchor for
  annual plans, and the grant anchor for admin-paid tiers. One chat run keeps
  the same window from preflight through settlement.
- Eligible X content enrichment has a separate monthly workspace cap with its
  own atomic reservation accounting.
- Free currently has `aiSummary: false`. A bounded monthly Free allowance is
  planned but not implemented; see [[../todos/free-ai-summary-allowance]].
- There is no saved-link count cap for Free or paid workspaces.

## Product behavior

Allowance exhaustion must preserve the accepted/saved link and avoid presenting
a provider or accounting failure as data loss. Each owning feature defines its
calm allowance-exhausted state and upgrade path.

## Authority

Executable defaults live in `src/lib/plan.ts`; workspace overrides are merged by
`Billing.capabilities`. This document is explanatory and must not be used as an
authorization source.

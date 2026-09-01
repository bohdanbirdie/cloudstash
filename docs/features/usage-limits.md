# Usage limits

Cloudstash uses workspace-period allowances for provider-backed operations and
active-link capacity for storage-growing work.

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
  own atomic reservation accounting and also consumes an AI-summary attempt.
- Imported X bookmarks consume the plan-defined monthly workspace allowance.
  Admission is idempotent across connected members, and overflow remains queued
  for the next subscription-aligned window rather than being silently skipped.
- Basic AI summaries reserve one idempotent monthly attempt before inference.
- Public REST and MCP tools share one subscription-aligned external-call
  counter. Raycast and Telegram ingestion do not consume it.
- Free and Plus active-link capacity is checked by web/extension clients and
  strictly serialized for server-originated saves. Archiving frees capacity.
  Pro uses a product-unlimited sentinel.

## Product behavior

Allowance exhaustion must preserve the accepted/saved link and avoid presenting
a provider or accounting failure as data loss. Each owning feature defines its
calm allowance-exhausted state and upgrade path.

Settings shows relevant remaining public units and one shared reset. Provider
spend, internal thresholds, and margin assumptions are not customer-facing.

## Authority

Executable defaults live in `src/lib/plan.ts`; workspace overrides are merged by
`Billing.capabilities`. This document is explanatory and must not be used as an
authorization source.

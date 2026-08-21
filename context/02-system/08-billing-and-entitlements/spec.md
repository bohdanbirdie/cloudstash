# Billing and Entitlements — Spec

This document specifies plans, capabilities, and Stripe synchronization. It
builds on [requirements.md](./requirements.md).

## Status

Active.

## Authority Model

```text
Stripe subscription ─ webhook/success ─► syncFromStripe ─► D1 organization
                                                              │
plan.ts tier defaults ─────────────────────────────────────────┤ merge
admin featureOverrides ────────────────────────────────────────┘
                                                              ▼
                                                 runtime capabilities
```

Stripe owns payment/subscription truth. D1 owns operational entitlement truth.
`Billing.capabilities(orgId)` merges `TIER_CAPABILITIES[tier]` with
`featureOverrides`; request paths do not contact Stripe.

## Capability Surface

Current boolean capability fields are AI summaries, chat agent, integrations, X
bookmark sync, X content enrichment, public API, MCP server, and weekly digest;
chat also has a monthly USD budget. Free, Plus, and Pro defaults are declared in
[`src/lib/plan.ts`](../../../src/lib/plan.ts). A per-workspace override can force
an individual value. Capability denial maps to HTTP 402 with capability and
required tier where an HTTP boundary applies.

Implemented gates include:

- `publicApi` — links read and ingest;
- `mcpServer` — every authenticated MCP exchange before protocol dispatch;
- `integrations` — Telegram connection and related pairing surfaces;
- `xBookmarkSync` — selected connect/resume handlers;
- `chatAgent` + `monthlyChatBudgetUsd` — agent auth and token reservation;
- `aiSummary`/`xContentEnrichment` — LinkProcessorDO;
- `weeklyDigest` — alarm scheduling/execution; manual trigger and tier-transition
  lifecycle remain incomplete.

The matrix is not yet enforced at every ongoing stateful boundary: Telegram use,
X direct OAuth/alarm polling, and some downgrade paths can continue without a
fresh capability check; see
[DELTA-015](../../.delta/DELTA-015-ongoing-integrations-bypass-entitlement-rechecks.md)
and [DELTA-037](../../.delta/DELTA-037-weekly-digest-entitlement-lifecycle-is-incomplete.md).

## Stripe Flow

Checkout authenticates the active workspace, creates/reuses a customer with a
deterministic key, maps requested tier+interval to configured Price ID, and
creates a Checkout session. Portal supports subscription management and
preserves billing interval across tier changes. The browser success callback and
Stripe webhook both call the same reconciliation function because either may
arrive first.

Webhook verification uses the raw request body. A signal resolves customer ID,
fetches live subscriptions, chooses the applicable subscription, maps its price
to tier/interval, and updates D1. Writes persist subscription ID/status, period
end, cancellation state, and interval. Stripe sync returns without changing
manual `tierSource: admin` grants.

## Plans and Price Drift

Paid tiers support monthly and annual prices. `check:pricing` compares local
plan values to configured Stripe prices when the required credentials are
available. Price IDs are configuration; secret API/webhook keys are not stored
in source. The landing and in-app paywall consume the same `PLANS` values for
price and feature copy.

## Usage Budgets

Chat reserves estimated tokens in workspace ChatAgentDO storage by monthly
period, checks the USD-derived token limit atomically, then reconciles provider
usage. X enrichment uses KV counter
`enrichment:<workspace>:<YYYY-MM>` with a configured cap and TTL. The KV
read-then-write counter is not atomic, so concurrent enrichment can exceed the
nominal cap; see
[DELTA-024](../../.delta/DELTA-024-enrichment-budget-is-not-atomic.md). These counters are cost
controls, not subscription truth.

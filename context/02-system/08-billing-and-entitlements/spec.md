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
- `integrations` — Telegram and Raycast pairing plus every subsequent capture;
- `xBookmarkSync` — OAuth completion, resume, X reconciliation, and
  alarm-time checks;
- `chatAgent` + `monthlyChatBudgetUsd` — initial agent auth plus a capability
  recheck and atomic token reservation before every model/tool continuation;
- `aiSummary`/`xContentEnrichment` — LinkProcessorDO;
- `weeklyDigest` — manual generation and alarm scheduling/execution; Stripe,
  admin-tier, and override changes immediately reconcile the workspace alarm.

Established sync connections still do not reauthorize approval and membership
after connection establishment; this access-lifecycle gap is tracked separately
in
[DELTA-011](../../.delta/DELTA-011-established-sync-connections-do-not-reauthorize.md).
Established chat connections recheck capability and budget at every turn, but
the public `AIChatAgent.onChatMessage` boundary does not expose the originating
connection identity needed to recheck approval and membership. That narrower
paid-operation gap is tracked in
[DELTA-042](../../.delta/DELTA-042-established-chat-connections-do-not-reauthorize.md).

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

## Billing Return Experience

The authenticated `/welcome` return surface reads the workspace's operational
billing state after checkout or portal changes. It shows an indeterminate state
while that state loads, then presents the confirmed tier and its benefits. Paid
tiers include the next renewal date when one is known.

If the billing state cannot be loaded, the surface keeps access to the library
available and offers an in-place retry. A rejected retry remains on that
recoverable state, is handled without an unhandled browser rejection, and can be
attempted again. A paid tier scheduled for cancellation remains presented as
active through its known period end and offers both library access and a path to
resume the subscription.

## Plans and Price Drift

Paid tiers support monthly and annual prices. `check:pricing` compares local
plan values to configured Stripe prices when the required credentials are
available. Price IDs are configuration; secret API/webhook keys are not stored
in source. The landing and in-app paywall consume the same `PLANS` values for
price and feature copy.

## Usage Budgets

Chat reserves estimated tokens in workspace ChatAgentDO storage by monthly
period, checks the USD-derived token limit atomically, then reconciles provider
usage. X enrichment reserves one attempt atomically in the workspace's
LinkProcessorDO storage before any provider work. Provider and generator
failures remain charged because the external attempt has started. Storage
failure skips enrichment and falls back to the ordinary summary path. These
counters are cost controls, not subscription truth. The workspace-owner choice
and cutover are recorded in
[decision 0002](./.decisions/0002-own-enrichment-reservations-in-link-processor.md).

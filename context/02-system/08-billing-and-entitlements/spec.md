# Billing and Entitlements — Spec

This document specifies plans, capabilities, and Stripe synchronization. It
builds on [requirements.md](./requirements.md).

## Status

Active.

## Authority Model

```text
Stripe subscription ─ webhook/success ─► synchronized Stripe tier ─┐
admin tier grant ────────────────────────────────────────────────────┤ max tier
                                                                    ▼
plan.ts tier defaults ──────────────────────────────────────── effective tier
admin featureOverrides ─────────────────────────────────────────────┤ merge
                                                                    ▼
                                                       runtime capabilities
```

Stripe owns payment/subscription truth. D1 owns operational entitlement truth.
`Billing.capabilities(orgId)` resolves one effective tier as the higher of the
synchronized Stripe tier and an optional admin grant, then merges
`TIER_CAPABILITIES[tier]` with `featureOverrides`; normal request paths do not
contact Stripe. Stripe remains authoritative when the tiers are equal, so its
subscription cycle continues to anchor usage; an admin grant becomes the
effective source only when it raises the tier. Admin grants are independent of
payment state and selecting Free removes the grant. After the usage cycle
projection first ships, an entitled Assistant request with missing cycle fields
performs one Stripe refresh and persists the result. Later requests use D1 only.

## Capability Surface

Current boolean capability fields are AI summaries, chat agent, integrations, X
bookmark sync, X content enrichment, public API, MCP server, and weekly digest;
numeric capabilities include active saved links and monthly AI summaries,
Assistant credits, external calls, imported X bookmarks, and enriched X
summaries. Free, Plus, and Pro defaults are declared in
[`src/lib/plan.ts`](../../../src/lib/plan.ts). A per-workspace override can force
an individual value. Capability denial maps to HTTP 402 with capability and
required tier where an HTTP boundary applies.

A manual boolean override that enables metered chat or X sync without an
explicit companion allowance derives the Pro allowance for that feature. This
keeps an administrative grant operationally equivalent to the corresponding
paid capability instead of enabling a feature whose allowance remains zero.

| Public allowance / month | Free |      Plus |               Pro |
| ------------------------ | ---: | --------: | ----------------: |
| Active saved links       |  100 |       500 | Product-unlimited |
| AI summaries             |   10 |       500 |             1,000 |
| Assistant credits        |    0 |         0 |             1,000 |
| Public API + MCP calls   |    0 | 1,000 API |   10,000 combined |
| Imported X bookmarks     |    0 |         0 |               200 |
| Enriched X summaries     |    0 |         0 |               100 |

Archiving removes a link from active capacity. Pro's product-unlimited saved
links use a zero sentinel in the executable matrix; private abuse controls are
operational policy rather than a customer allowance. An X enrichment consumes
both one AI-summary attempt and one X-enrichment attempt.

Implemented gates include:

- `publicApi` — links read and ingest;
- `mcpServer` — every authenticated MCP exchange before protocol dispatch;
- `integrations` — Telegram and Raycast pairing plus every subsequent capture;
- `xBookmarkSync` — OAuth completion, resume, X reconciliation, and
  alarm-time checks, plus workspace-period bookmark admission;
- `chatAgent` + `monthlyAssistantCredits` — initial agent auth plus a capability
  recheck and settled-spend preflight before every model/tool continuation;
- `aiSummary`/`xContentEnrichment` — LinkProcessorDO;
- `weeklyDigest` — manual generation and alarm scheduling/execution; Stripe,
  admin-tier, and override changes immediately reconcile the workspace alarm.

Established sync connections still do not reauthorize approval and membership
after connection establishment; this access-lifecycle gap is tracked separately
in
[DELTA-011](../../.delta/DELTA-011-established-sync-connections-do-not-reauthorize.md).
Established chat connections recheck capability and allowance at every turn, but
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
to tier/interval, and updates D1. Writes persist subscription ID/status, item
period start/end, billing-cycle anchor, cancellation state, and interval. Stripe
sync always updates that projection regardless of admin state. Admin paid-tier
grants persist independently with their grant time and act as a tier floor; they
never downgrade or block a Stripe subscription.

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

Chat checks settled monthly spend in workspace LinkProcessorDO storage, then
records actual provider-reported cost in an idempotent settlement and monthly
aggregate. X bookmark sync serializes workspace admission and retirement in
that same owner, deduplicates source bookmark IDs within the usage window,
sends admitted work to the Queue, and records the monthly count. Present
malformed durable usage state fails closed as a typed storage error; only an
absent value initializes a new meter. A crash between Queue acceptance and the
count write can repeat delivery, but common-ingest idempotence prevents a
duplicate library item.

X enrichment and basic AI summaries reserve idempotent attempts atomically in
the workspace's LinkProcessorDO storage before provider work. REST and MCP
reserve from one combined external-call counter at the same owner. Provider and
generator failures remain charged because the external attempt has started.
Storage failure skips optional AI work without losing accepted metadata or link
state. Server-originated saves serialize duplicate detection, active-count
admission, and commit in LinkProcessorDO. Web and extension clients check their
local active count immediately; when entitlement state is unavailable they
retain local-first acceptance, so cross-client convergence can temporarily
exceed a cap but never silently discard a saved link. These
counters are cost controls, not subscription truth. The workspace-owner choice
and cutover are recorded in
[decision 0002](./.decisions/0002-own-enrichment-reservations-in-link-processor.md).

All monthly allowance periods follow the workspace entitlement
rather than UTC calendar months. Monthly Stripe subscriptions use their exact item period. Annual Stripe
subscriptions receive monthly subwindows derived from the persisted billing
anchor and bounded by the active annual period. Admin grants use their grant
anchor when they supply the effective paid tier (legacy grants fall back to
workspace creation time). A manual metered-feature or allowance override also
receives a monthly window anchored to workspace creation when no Stripe or
admin-tier window exists. UTC recurrence clamps end-of-month anchors
deterministically. One resolved window is carried through preflight and
settlement for the complete model run.

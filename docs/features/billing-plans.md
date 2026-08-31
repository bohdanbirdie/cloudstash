# Billing and plans

Per-workspace Free, Plus, and Pro plans are implemented with Stripe Checkout,
Customer Portal, webhook/success reconciliation, an admin grant path, and
server-side capability gates.

## Authority model

Stripe owns subscription/payment truth. D1 stores the operational projection
for one workspace. `Billing.capabilities(orgId)` merges the tier defaults in
`src/lib/plan.ts` with sparse workspace overrides; normal feature checks never
call Stripe. An optional admin grant is a tier floor over the synchronized
Stripe tier, so it can add access without replacing payment state.

`PLANS` is product copy. `TIER_CAPABILITIES` is executable policy. Copy is never
an authorization source and known mismatches remain tracked in the Intent
deltas.

## Current capability shape

The runtime matrix includes AI summaries, chat agent, integrations, X bookmark
sync/content enrichment, public API, MCP server, weekly digest, monthly
Assistant credits, and monthly imported X bookmarks. Exact tier values belong
only in `src/lib/plan.ts`.

Authoritative handlers return a structured capability denial when the current
workspace lacks a feature. Some ongoing stateful paths still need operation-time
reauthorization; see [[../todos/paid-capability-enforcement]]. The MCP capability
is declared Pro-only but no server is deployed; see
[[../todos/develop-mcp-server]].

## Stripe lifecycle

Checkout creates/reuses a workspace customer and uses deterministic idempotency.
Webhook and browser-success signals both fetch current Stripe subscription state
before updating D1. Active/trialing/past-due subscriptions retain their mapped
tier; cancelled/unpaid/incomplete states map according to current billing policy.
Stripe synchronization persists the selected item's period start/end and the
subscription billing anchor regardless of admin grants. Admin grants persist
separately and Stripe continues to reconcile underneath them.

Settings is the subscription-management surface; the shipped paywall is the
acquisition surface. Production Stripe/Portal reconciliation remains a
maintainer-controlled launch action in [[../todos/human-launch-operations]].

## Usage allowances

Chat checks and settles actual monthly provider cost against the workspace's
Assistant credits. Imported X bookmarks use a subscription-aligned workspace
counter, and X enrichment keeps its separate attempt reservation contract. Free
saved-link count is unlimited; a bounded monthly Free summary
allowance remains planning work. See [[usage-limits]].

# Billing & Plans (Stripe)

Per-workspace subscription billing, gating features by tier (Free / Plus / Pro).

**Status:** Phase 1 shipped — capabilities model, `Billing` service, tier + per-org overrides, admin UI, and server-side gates. Phase 2 (Stripe Checkout / Portal / webhook) is **not built**; the design for it is at the bottom.

## Mental model

Stripe owns **billing state** (what they pay for). D1 owns **feature access** (what they can do). A webhook keeps the second in sync with the first. Request-time code never calls Stripe — it reads `organization.tier` from D1 and asks `Billing` for capabilities.

```
Stripe (subscriptions) ──webhook──> Billing.syncFromStripe ──> D1 org row ──> Billing.capabilities(orgId)
```

Billing is **per-organization, not per-user**: the user who upgrades is the actor, the subscription belongs to the workspace.

## Capabilities model

`src/lib/plan.ts` is the single source of truth. Two separate surfaces, edited at different cadences:

- `PLANS` — marketing copy (name, price, taglines, feature bullets).
- `TIER_CAPABILITIES` — the runtime gate matrix: `Record<PlanTier, TierCapabilities>`.

`TierCapabilities` = booleans `aiSummary`, `chatAgent`, `integrations`, `xBookmarkSync`, `publicApi`, `mcpServer`, plus `monthlyChatBudgetUsd` (number). Roughly: Free = saving core only; Plus adds AI summaries, integrations, and the public API; Pro adds chat, X-bookmark sync, MCP, and a chat budget. **Exact per-tier values live in `plan.ts` — don't duplicate them here.**

Only the **tier** is stored in D1; capabilities are derived at read time via `capabilitiesFor(tier)` / `mergeCapabilities(tier, overrides)`. Changing what a tier includes is a one-file edit, no migration.

**Overrides.** `organization.featureOverrides` (`Partial<TierCapabilities>`, usually `{}`) layers per-org exceptions on top of the tier — beta access, comps, dev testing:

```ts
Billing.capabilities(orgId) ≈ { ...TIER_CAPABILITIES[org.tier], ...org.featureOverrides }
```

(Not Stripe Entitlements: simpler and version-controlled for 3 tiers. Revisit only for pricing experiments.)

## The `Billing` service

All entitlement logic lives behind one `Effect.Service` (`src/cf-worker/billing/service.ts`); app code never imports Stripe or the schema directly. Phase 1 methods: `capabilities`, `tier`, `getOverrides`, `setTier`, `setOverride`, `exists`, `listWithOwners`. `capabilities(orgId)` is what ~all gates read.

`setTier` / `setOverride` are **admin writes that bypass Stripe** (comps, beta, testing) and stamp `tierSource = "admin"` so a later Stripe sync won't clobber the grant.

## Gates (server-side enforcement)

`requireCapability(orgId, cap)` fails with `CapabilityDisabledError` → `capabilityDeniedResponse` → **402** with `{ capability, requiredTier }` so the client can drive an "Upgrade to <tier>" CTA without hard-coding the mapping.

| Capability             | Enforced in                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `publicApi`            | `auth/api-key-gate.ts` (`requireCapability`)                                                                                            |
| `integrations`         | `connect/raycast.ts`, `connect/telegram.ts` (`requireCapability`)                                                                       |
| `xBookmarkSync`        | `connect/x.ts` (`requireCapability`)                                                                                                    |
| `chatAgent`            | `chat-agent/auth.ts` — own `ChatFeatureDisabledError` check                                                                             |
| `aiSummary`            | LinkProcessorDO via its feature store                                                                                                   |
| `monthlyChatBudgetUsd` | chat-agent token reservation (converted via `budgetToTokenLimit()` in `chat-agent/usage.ts`; fails **closed** if the cap can't be read) |
| `mcpServer`            | **declared, not yet built** — see `todos/develop-mcp-server.md`                                                                         |

## Schema (`organization` table)

`featureOverrides` (`Partial<TierCapabilities>` JSON, default `{}`) plus the billing columns:

| Column                 | Type / default              | Notes                                                    |
| ---------------------- | --------------------------- | -------------------------------------------------------- |
| `tier`                 | text, `"free"`              | `free \| plus \| pro`                                    |
| `tierSource`           | text, `"stripe"`            | `stripe \| admin` — `syncFromStripe` won't touch `admin` |
| `stripeCustomerId`     | text, nullable, unique      | Created before first checkout                            |
| `stripeSubscriptionId` | text, nullable              | Current active subscription                              |
| `subscriptionStatus`   | text, nullable              | `active`, `trialing`, `past_due`, `canceled`, …          |
| `currentPeriodEnd`     | integer (unix ms), nullable | Renewal display                                          |
| `cancelAtPeriodEnd`    | boolean, false              | "ending soon" badge                                      |

## Admin

`/api/auth/me` returns derived org state only (`{ id, name, slug, tier, capabilities }`) — never raw overrides; `useOrgFeatures()` reads from `capabilities`.

Admin-only endpoints (all behind `requireAdmin`):

- `GET  /api/admin/workspaces` — list with tier + tierSource + overrides + capabilities
- `GET  /api/org/:id/settings` — tier + overrides + capabilities
- `PUT  /api/org/:id/tier` — `{ tier }` → `Billing.setTier`
- `PUT  /api/org/:id/overrides` — `{ key, value | null }` → `Billing.setOverride` (`null` clears)

UI: `src/components/admin/workspaces-tab/` — per-row tier picker + a three-state toggle per boolean cap (inherit / force-on / force-off) + budget input.

---

## Phase 2 — Stripe wiring (not built)

Flow: Settings Plan UI → `/api/billing/checkout` (or `/portal`) → Stripe → webhook `/api/stripe/webhook` → `Billing.syncFromStripe(customerId)` → D1 row. The post-checkout redirect `/api/stripe/success` calls `syncFromStripe` too — users routinely beat the webhook back.

**Sync rule.** Never trust webhook payloads for what to write. A webhook means "something changed for customer X" → fetch the live subscription from Stripe → map its price ID to a tier → write. Idempotent by construction. Status mapping: `active`/`trialing`/`past_due` → mapped tier; `canceled`/`unpaid`/`incomplete*` → `free`. Always writes `tierSource = "stripe"` and leaves `admin` grants alone.

Env (per test/live mode): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_PRO`. Secrets in `.dev.vars` (uncommitted) / wrangler secrets — never in this repo.

**Stripe-on-Cloudflare gotchas (hard-won):**

- Construct with `Stripe(key, { httpClient: Stripe.createFetchHttpClient() })`; the default Node client fails even with `nodejs_compat`. Use `webhooks.constructEventAsync(...)` (sync uses Node crypto).
- Webhook signature needs the **raw** body — Hono parses JSON eagerly, so grab `await c.req.raw.text()`.
- Always pass deterministic `Idempotency-Key` on writes (`customer:${orgId}`, `checkout:${orgId}:${tier}:${dateBucket}`) — retries otherwise duplicate.
- Create the Stripe customer **before** Checkout (`getOrCreateStripeCustomer(orgId)`), else orphan customers and unmappable webhooks.
- A failed sync must **not** fail the webhook ack — wrap and let Stripe retry.
- Dashboard: one Product+Price per paid plan; enable Customer Portal (and configure it before `billingPortal.sessions.create`); turn on "Limit customers to one subscription" (prevents double-checkout); disable Cash App Pay (fraud-prone).
- One Stripe customer per workspace — surface "billing is per-workspace" in UI to cut support tickets.

**Local:** `stripe listen --forward-to localhost:3000/api/stripe/webhook`; test card `4242 4242 4242 4242`.

**Open questions:** per-seat vs flat-rate; free trial policy; proration on up/downgrade; whether downgrades drop features immediately or at `currentPeriodEnd` (Stripe Portal defaults to end-of-period).

## References

- [Theo's stripe-recommendations](https://github.com/t3dotgg/stripe-recommendations) — the sync-function / customer-first patterns this follows
- [Stripe SaaS guide](https://docs.stripe.com/saas) · [subscriptions use case](https://docs.stripe.com/get-started/use-cases/saas-subscriptions) · [Entitlements](https://docs.stripe.com/billing/entitlements) (deferred)

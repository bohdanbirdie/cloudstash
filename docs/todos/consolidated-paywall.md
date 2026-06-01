# Consolidated paywall / upgrade system

Build **one** reusable paywall + upgrade system used everywhere a capability is gated, replacing today's ad-hoc, per-feature handling. App-wide — not tied to any single feature (the Chrome extension that prompted this is now free; see [[chrome-extension]]).

## Why

Capability gating is currently scattered across the app with no shared client component, no single "what tier does this need" contract, and no single upgrade entry point. Each gated surface invented its own dead-end:

- The **agent chat** keeps `AgentTrigger` + ⌘J wired for non-enabled users purely to surface a **promo/placeholder** (kanban: "Gate all agent UI on per-user feature flag").
- The **AI-summary promo** (`src/components/right-pane/detail-view/ai-summary-promo.tsx`) is its own bespoke upsell card.
- The (now removed) extension `UpgradeScreen` rendered its own 402 state and its upgrade CTA just opened the **app root** (`${APP_URL}/`) because there's no deep-link to the plan dialog.
- The plan dialog itself is a **Zustand-driven modal**, not a route — so nothing outside the app shell can link a user straight to "upgrade to Pro".

Result: every new gated feature re-solves upsell UX, copy, and the "where does the upgrade button go" problem from scratch.

## Goals

1. **One client paywall component** — a single `<Paywall capability=... />` (or hook) that renders the upsell for any gated capability: required tier, plan-specific copy, and a CTA that routes to the upgrade entry point. Used by agent chat, AI-summary promo, integrations, X enrichment, MCP, and any future gate.
2. **One server contract** — a single source of truth mapping `capability → required tier`, already half-present as `TIER_CAPABILITIES` in `src/lib/plan.ts`. Server enforcement (`requireCapability`) and client rendering must read the **same** map so UI and enforcement never drift.
3. **One upgrade entry point** — a deep-linkable route/param (e.g. `?upgrade=<plan>` or `/upgrade/<plan>`) that lands on billing and opens checkout/portal for the target tier. Replaces today's "open the app root and hope the user finds Settings → Plan." External surfaces (extension, emails, Telegram/Raycast errors) can link to it directly.
4. **Consistent 402 handling** — when a server capability check denies (402 via `capabilityDeniedResponse`), clients have one shared way to turn that into the paywall UI + upgrade link, instead of each call site inventing its own handler.

## Current scattered touchpoints to unify

Inventory from grepping `requireCapability` / `capabilityDeniedResponse` / `changePlan` (2026-05-30):

### Server enforcement (`requireCapability` → `capabilityDeniedResponse`)

| Surface                  | File                                     | Capability                                                                  |
| ------------------------ | ---------------------------------------- | --------------------------------------------------------------------------- |
| Public API gate          | `src/cf-worker/auth/api-key-gate.ts`     | `publicApi`                                                                 |
| Sync WS (was: extension) | `src/cf-worker/sync/validate-payload.ts` | `integrations`                                                              |
| Raycast connect          | `src/cf-worker/connect/raycast.ts`       | `integrations`                                                              |
| Telegram connect         | `src/cf-worker/connect/telegram.ts`      | `integrations`                                                              |
| X bookmark sync connect  | `src/cf-worker/connect/x.ts`             | `xBookmarkSync`                                                             |
| Extension connect        | `src/cf-worker/connect/extension.ts`     | (now free — `capabilityDeniedResponse` only as error mapping; gate removed) |

Shared primitives: `requireCapability` (`src/cf-worker/billing/service.ts`), `capabilityDeniedResponse` (`src/cf-worker/billing/errors.ts`).

> Note: the Chrome extension's `integrations` gate was **removed** on 2026-05-30 — the extension is free. Raycast + Telegram remain `integrations`-gated (Plus+). This consolidation does not change which surfaces are gated; it unifies _how_ the gate is presented and how the user upgrades.

### Capability → tier map (the contract)

- `TierCapabilities` + `TIER_CAPABILITIES` + `CapabilityOverrides` in `src/lib/plan.ts` — booleans per tier: `aiSummary`, `chatAgent`, `integrations`, `xBookmarkSync`, `xContentEnrichment`, `publicApi`, `mcpServer`, `weeklyDigest`, plus `monthlyChatBudgetUsd`. This is already the de-facto contract; the consolidation should make it the **only** capability source both server and client read.

### Client upgrade entry points (`changePlan`)

| Surface                  | File                                                | Notes                                           |
| ------------------------ | --------------------------------------------------- | ----------------------------------------------- |
| Settings → Plan section  | `src/components/settings/sections/plan-section.tsx` | In-app plan dialog (Zustand modal)              |
| Welcome / onboarding     | `src/routes/welcome.tsx`                            | Tier selection on first run                     |
| Connect (extension page) | `src/routes/connect/extension.tsx`                  | Calls `changePlan(requiredTier, "free")` inline |

Shared primitive: `changePlan(target, currentTier)` (`src/lib/billing.ts`) → `POST /api/billing/checkout` or `/api/billing/portal`.

### Bespoke client upsell UI (to fold into the shared component)

- Agent chat promo placeholder (kept wired behind `isChatEnabled` to show the upsell — see kanban "Gate all agent UI on per-user feature flag").
- `src/components/right-pane/detail-view/ai-summary-promo.tsx` — AI-summary upsell card.
- The removed extension `UpgradeScreen` (gone, but its pattern — render 402 → upsell → open app root — is exactly what the shared component should replace).

## Desired API (outline)

Planning sketch, not final. The point is one contract, one component, one entry point.

```ts
// Contract (shared, src/lib/plan.ts already has the data)
type Capability = keyof TierCapabilities;            // existing
requiredTierFor(capability): PlanTier                // derive from TIER_CAPABILITIES
capabilityIsAllowed(caps, capability): boolean       // existing override-aware check
```

```tsx
// Client component — one upsell surface for every gate
<Paywall capability="chatAgent">
  {/* gated children render only when allowed */}
</Paywall>;
// or imperatively:
const { allowed, requiredTier, openUpgrade } = useCapabilityGate("mcpServer");
```

```
// Upgrade entry point — deep-linkable, replaces "open app root"
/?upgrade=<plan>   (or /upgrade/<plan>)
  → lands on billing, opens the plan dialog / checkout for <plan>
  → callable from: extension, transactional emails, Telegram/Raycast 402 errors,
    any in-app paywall CTA
```

```
// Server → client 402 bridge
capabilityDeniedResponse already returns the denied capability + required tier.
A shared client interceptor maps any 402 → <Paywall> / openUpgrade(requiredTier).
```

## Scope / non-goals

- This is a **planning doc** — no code yet.
- Does **not** re-decide which features are gated or at which tier (that lives in `TIER_CAPABILITIES`).
- Does **not** change billing/Stripe plumbing (`changePlan`, checkout/portal endpoints stay); it standardizes how users _reach_ them.

## First steps (when picked up)

1. Promote `TIER_CAPABILITIES` to the single capability contract; add `requiredTierFor` + ensure server `requireCapability` and client both consume it.
2. Build the `/?upgrade=<plan>` (or route) entry point that lands on billing and opens checkout/portal for the target tier.
3. Build the shared `<Paywall>` / `useCapabilityGate` component reading the contract + linking to the entry point.
4. Migrate the bespoke surfaces (agent promo, AI-summary promo, any future extension/MCP upsell) onto it; add a shared 402 → paywall interceptor.

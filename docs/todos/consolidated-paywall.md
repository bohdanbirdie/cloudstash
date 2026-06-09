# Consolidated paywall / upgrade system

Build **one** reusable paywall + upgrade system used everywhere a capability is gated, replacing today's ad-hoc, per-feature handling. App-wide — not tied to any single feature (the Chrome extension that prompted this is now free; see [[chrome-extension]]).

## Why

Capability gating is currently scattered across the app with no shared client component, no single "what tier does this need" contract, and no single upgrade entry point. Each gated surface invented its own dead-end:

- The **agent chat** keeps `AgentTrigger` + ⌘J wired for non-enabled users purely to surface a **promo/placeholder** (kanban: "Gate all agent UI on per-user feature flag").
- The **AI-summary promo** (`src/components/right-pane/detail-view/ai-summary-promo.tsx`) is its own bespoke upsell card.
- The (now removed) extension `UpgradeScreen` rendered its own 402 state and its upgrade CTA just opened the **app root** (`${APP_URL}/`) because there's no deep-link to the plan dialog.
- The plan dialog itself is a **Zustand-driven modal**, not a route — so nothing outside the app shell can link a user straight to "upgrade to Pro".
- The **public landing pricing** CTAs (`CTA_BY_TIER` in `src/components/landing/pricing.tsx`) all point to `/login` regardless of tier, so a visitor who clicks "Start Pro" loses that intent — they land in `/inbox` on the free tier with no checkout. `/login` also hardcodes the OAuth `callbackURL: "/inbox"`, so even a tier param on the button wouldn't survive sign-in today. The pricing page is the highest-intent purchase surface and currently has no path to payment.

Result: every new gated feature re-solves upsell UX, copy, and the "where does the upgrade button go" problem from scratch.

## Goals

1. **One client paywall component** — a single `<Paywall capability=... />` (or hook) that renders the upsell for any gated capability: required tier, plan-specific copy, and a CTA that routes to the upgrade entry point. Used by agent chat, AI-summary promo, integrations, X enrichment, MCP, and any future gate.
2. **One server contract** — a single source of truth mapping `capability → required tier`, already half-present as `TIER_CAPABILITIES` in `src/lib/plan.ts`. Server enforcement (`requireCapability`) and client rendering must read the **same** map so UI and enforcement never drift.
3. **One upgrade entry point** — a deep-linkable route/param (e.g. `?upgrade=<plan>` or `/upgrade/<plan>`) that lands on billing and opens checkout/portal for the target tier. Replaces today's "open the app root and hope the user finds Settings → Plan." External surfaces (extension, emails, Telegram/Raycast errors) **and the public landing pricing CTAs** can link to it directly. For anonymous visitors the entry point must survive the login round-trip: the chosen tier has to thread through `/login` → OAuth `callbackURL` → post-auth checkout, so "Start Pro" on the marketing page actually opens Pro checkout once signed in.
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

| Surface                  | File                                                | Notes                                                                                                                                                                            |
| ------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings → Plan section  | `src/components/settings/sections/plan-section.tsx` | In-app plan dialog (Zustand modal)                                                                                                                                               |
| Welcome / onboarding     | `src/routes/welcome.tsx`                            | Tier selection on first run                                                                                                                                                      |
| Connect (extension page) | `src/routes/connect/extension.tsx`                  | Calls `changePlan(requiredTier, "free")` inline                                                                                                                                  |
| Public landing pricing   | `src/components/landing/pricing.tsx`                | **Anonymous** — `CTA_BY_TIER` hardcodes `/login` for every tier; no `changePlan`, no checkout. Must route through the deep-link entry point so the chosen tier survives sign-in. |

Shared primitive: `changePlan(target, currentTier)` (`src/lib/billing.ts`) → `POST /api/billing/checkout` or `/api/billing/portal`.

> The landing pricing surface is unique: the user is **not yet authenticated**, so it can't call `changePlan` directly. It needs the deep-linkable upgrade entry point (Goal 3) plus tier-aware login threading (`/login?upgrade=<plan>` → OAuth `callbackURL` carrying the tier → post-auth checkout). Today `/login` hardcodes `callbackURL: "/inbox"`, which is the concrete blocker.

### Bespoke client upsell UI (to fold into the shared component)

- Agent chat promo placeholder (kept wired behind `isChatEnabled` to show the upsell — see kanban "Gate all agent UI on per-user feature flag").
- `src/components/right-pane/detail-view/ai-summary-promo.tsx` — AI-summary upsell card.
- The removed extension `UpgradeScreen` (gone, but its pattern — render 402 → upsell → open app root — is exactly what the shared component should replace).

## UX design — locked direction (2026-06-09)

Synthesized from the marketer's paywall brief + a competitor's isolated-modal pattern. Decided with the user:

- **Dedicated modal, not a route-as-state (2026-06-09).** The paywall is a **dedicated isolated modal** (dim backdrop, desktop) + **full-screen `vaul` sheet** (mobile), extracted out of Settings. Its open/selected state lives in a `usePaywall` Zustand store — **never in the URL.** A link _can_ trigger it open (a transient `?upgrade` param that's read once and stripped), but the modal is **not** a URL-addressable page and tier/interval are **not** durable link state.
- **Landing / explicit intent:** "Start Pro" does **not** jump straight to Stripe. After auth it opens the modal **with Pro pre-highlighted** (one-click confirm) via the transient trigger, so the conversion screen always gets to do its job — one consistent surface for every path.
- **Pricing (2026-06-09):** the annual prices ($50/yr, $120/yr) are **already the discounted prices on the Stripe side** — the 17% is the annual-vs-monthly saving, baked in. No checkout-time coupon, no promo lever; list price stands.

### The one idea: one surface, one trigger, many doors

Everything that gates funnels to a **single isolated "Choose a plan" surface**, which is the last step before Stripe. The doors differ; the room is always the same.

```
   sidebar "Upgrade"   ─┐
   locked feature gate  ─┤
   chat tease-then-gate ─┤──▶  openPaywall({ reason?, highlightTier? })  ──▶  Stripe Checkout
   landing "Start Pro"  ─┤        = the ONE dedicated modal (Zustand)         (free→paid)
   ?upgrade link trigger ┤        (Dialog desktop · vaul sheet mobile)         / Portal
   server 402 response  ─┘        BIG button ──▶ changePlan(tier, interval)    (paid→paid)
```

Modal state is in the store, not the URL. The `?upgrade[=tier]` param is a one-shot _trigger_ (read on mount → `openPaywall` → stripped via `replace`), so links open the modal without it becoming durable/bookmarkable state.

### The paywall surface (marketer's 8 points → our tiers)

```
┌──────────────────────────────────────────────────────────────────┐
│  Unlock the full Cloudstash                                  [✕]   │  (8) CTA headline
│  AI on every save · chat with your archive · every integration     │
│              ‹ Monthly   ●Yearly · Save 17% ›                       │  (3) yearly pre-selected + savings
│  ┌──────────────────────────┐   ┌───────────────────────────────┐ │
│  │ PLUS        ★ Most popular│   │ PRO            ◆ Best value    │ │  (7) both tagged; Pro = hero (inverted)
│  │  $50/yr  (was $60)        │   │  $120/yr  (was $144)          │ │  (5) struck full-annual + Save 17%
│  │  $50/yr · Save 17%        │   │  $120/yr · Save 17%           │ │     (locked framing — annual total, not /mo)
│  │  ✓ AI summary every save  │   │  Everything in Plus, plus     │ │
│  │  ✓ Telegram·Raycast·iOS   │   │  ✓ Chat with your archive     │ │
│  │  ✓ Weekly digest          │   │  ✓ X bookmark sync            │ │
│  │  ✓ Public API             │   │  ✓ Larger model · MCP server  │ │
│  │ [    Upgrade to Plus    ] │   │ [     Upgrade to Pro      ]   │ │  (4) BIG buttons, Pro bright
│  └──────────────────────────┘   └───────────────────────────────┘ │
│           Cancel anytime · keeps features till period end          │
└──────────────────────────────────────────────────────────────────┘  (1) dim backdrop: nothing else visible
```

| #   | Marketer ask                                     | How we satisfy it                                                                                                |
| --- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 1   | Paywall = paywall, hide everything else          | Modal w/ dim backdrop (desktop) / full-screen sheet (mobile). No nav, no sidebar.                                |
| 2   | Fullscreen or vertical, don't refight mobile     | **One** component, built vertical-first: `flex-col` (stacked sheet) → `lg:flex-row` (2-col desktop).             |
| 3   | Yearly pre-selected + "Save X%"                  | Default `interval="year"`; `yearlySavings` → **17%** real (the brief's "30%" is aspirational, ignore).           |
| 4   | BIG payment buttons                              | Full-width `size="lg"` per card; Pro bright/inverted = hero.                                                     |
| 5   | Struck-through price                             | Reuse the landing `<s>$X</s>` + savings pill already shipped in `pricing.tsx`.                                   |
| 6   | Fits one screen for comparison                   | Two columns only (Plus, Pro). Free = current state, not a buy column. Feature lists capped ~5.                   |
| 7   | Best-value (priciest) + most-popular both bright | **Pro = "Best value"** (hero, inverted); **Plus = "Most popular"** (highlighted). Half-encoded in `PLANS` today. |
| 8   | Call-to-action above plans                       | "Unlock the full Cloudstash" headline + one value line.                                                          |

Marketing-page-only (not the modal): comparison table, FAQ, testimonials live **below** the landing pricing section — same plan data, different surface.

### Entry points & gate patterns (competitor's lesson: tease, then gate)

| Door                                    | Pattern                         | Behavior                                                                                                                                                                               |
| --------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sidebar "Upgrade"                       | Persistent entry                | Visible for free/plus → opens surface. Flips to "Manage plan" → Portal for paid.                                                                                                       |
| Locked feature (e.g. AI-summary slot)   | Inline mini-gate                | Small "+ Upgrade for AI summaries…" in place of the feature → opens surface, `highlightTier` = required tier, echoes reason. Folds in `ai-summary-promo.tsx`.                          |
| Chat / ⌘J                               | **Soft gate — tease then gate** | Let them open chat, type, send; gate the _response_: "AI Chat is a Pro feature…" + inline "Upgrade to Pro". This is why `AgentTrigger`/⌘J stay wired (see kanban "Gate all agent UI"). |
| Landing pricing CTA                     | Explicit intent                 | After auth, `?upgrade=pro` trigger opens the modal with Pro pre-highlighted (1-click), then strips the param.                                                                          |
| External (email, extension)             | Link trigger                    | `…/inbox?upgrade=pro` opens the modal pre-highlighted; `?upgrade` (no tier) opens it with nothing selected.                                                                            |
| Server 402 (`capabilityDeniedResponse`) | External-only                   | 402s only reach external clients (Raycast/Telegram/API/extension); **no in-app consumer** (web gates are client capability checks). Map 402 → paywall only on those external surfaces. |

**Gate taxonomy:** _soft_ (tease-then-gate) where experiencing the affordance sells it — chat, AI summary, integrations. _Hard_ (immediate) only where teasing is meaningless — raw API/connect 402s.

### Surface mechanics — dedicated modal, state in the store (not the URL)

- Desktop → Dialog (dim backdrop = isolation). Mobile → full-screen `vaul` Drawer (reuse the mobile-detail-sheet infra). Same `<PaywallModal>` component, responsive.
- State lives in a `usePaywall` Zustand store: `openPaywall({ reason?, highlightTier? })`. The modal is **not** a route and its state is **not** URL-addressable.
- Replaces the de-facto paywall today (Settings → Plan via `UpgradeCta` → `useSettingsDialog().openAt("plan")`). After this, `UpgradeCta` + promos + sidebar + landing all call `openPaywall`; **Settings → Plan stays for management** (cancel/downgrade/resume/interval). Both render a shared `PlanCards` core so prices/badges can't drift.
- Modal reads `useOrgFeatures().tier` so buttons self-label: **Upgrade** (free→paid, checkout) / **Switch to Pro** (plus→pro, Portal) / **Current plan** (disabled). Every click calls existing `changePlan()` — billing plumbing untouched.

### Opening the modal from a link (transient trigger, no durable state)

A link may open the modal, but the open/selected state never lives in the URL:

```
…/inbox?upgrade=pro            (or bare ?upgrade)
  on mount: read param → openPaywall({ highlightTier: "pro" })
            → navigate({ search: strip "upgrade" }, { replace: true })   // one-shot, gone from history

Anonymous landing CTA:
  Start Pro → /login?upgrade=pro → signIn.oauth2({ callbackURL: "/inbox?upgrade=pro" })
           → Google → /inbox?upgrade=pro → trigger fires → modal opens, Pro highlighted, param stripped
  (today /login hardcodes callbackURL "/inbox")

Verified vs better-auth 1.6.13: a relative callbackURL WITH a query string is supported and survives
the round-trip — `origin-check.mjs` validates callbackURL with allowRelativePaths hardcoded true; the
relative-path regex in `trusted-origins.mjs` explicitly permits `?…` (charset `[\w\-.\+/=&%@]`);
`oauth2/state.mjs` stores it verbatim and `generic-oauth/routes.mjs` redirects to it verbatim (no strip).
New signups too (callback uses `newUserURL || callbackURL`; we don't set newUserCallbackURL). No
sessionStorage, no trustedOrigins change needed.
```

No interval in the link: a brand-new user defaults to yearly in the modal; existing paid users keep their locked interval (no self-serve switch). Validate `tier` against the enum; ignore anything else.

Stripe side is already on the recommended pattern — **no plumbing change**: Checkout Sessions `mode:"subscription"`, dynamic payment methods (no `payment_method_types`), per-org customer reuse, Portal for paid→paid, webhook + `/api/stripe/success`→`/welcome` sync. Checkout/portal stay auth-gated + CSRF-guarded.

### Sales / CRO details to preserve

1. **Interval is not carried in links** — the modal defaults to yearly for free/new users and shows the locked interval for paid users (per the no-self-serve-switch decision). Whatever the user confirms in the modal is exactly what checkout charges.
2. **Recoverable abandonment** — Stripe `cancel_url` is `/inbox` today; point it at `/inbox?upgrade=1` (transient trigger) so a bailed checkout re-opens the modal instead of dropping the sale silently.
3. **Existing customers → Portal, never a 2nd checkout** — `changePlan` already branches paid→Portal (proration).
4. **Double-click safety** — today's `idempotencyKey` is a fresh UUID per call (doesn't dedupe a double-submit); disable the button on click and/or key idempotency on `${orgId}:${tier}:${interval}`.
5. **Display↔Stripe parity is an invariant** — landing/modal render `PLANS.pricing` while Stripe charges via `priceForTier` IDs; guard with a test so they can't drift. ($50/$120 are the already-discounted Stripe prices.)

### Reuse vs build

- **Reuse:** `PLANS` + `yearlySavings` + the landing strikethrough/savings card (extract into a shared `PlanCards` core for both landing section and modal), `changePlan`, `IntervalToggle`, `TIER_CAPABILITIES`, the Settings management surface, the entire Stripe layer.
- **Build:** `usePaywall` store + `<PaywallModal>` (Dialog + `vaul` Drawer), the `?upgrade` transient-trigger reader, sidebar "Upgrade" entry, inline mini-gate + chat soft-gate (repoint `UpgradeCta`/promos onto `openPaywall`), tier-aware `/login` `callbackURL` threading.

## Desired API (outline)

Refined against the locked design. One contract, one surface, one entry point.

```ts
// Contract (shared, src/lib/plan.ts already has the data)
type Capability = keyof TierCapabilities;            // existing
requiredTierFor(capability): PlanTier                // derive from TIER_CAPABILITIES
capabilityIsAllowed(caps, capability): boolean       // existing override-aware check
```

```tsx
// One trigger (Zustand) — opens the dedicated modal from any door. State here, never in the URL.
const openPaywall: (opts?: {
  reason?: string; // "AI Chat is a Pro feature" — echoed as a subheading
  highlightTier?: PlanTier; // pre-highlight a card (landing intent, feature gate)
}) => void;

// <PaywallModal/> renders as Dialog (desktop) / vaul Drawer (mobile). Inline gates are thin
// wrappers that call openPaywall (repointing today's UpgradeCta → openAt("plan")):
const { allowed, requiredTier } = useCapabilityGate("mcpServer"); // reads TIER_CAPABILITIES
// gate UI → onClick={() => openPaywall({ highlightTier: requiredTier, reason })}
```

```
// Link → modal: a ONE-SHOT trigger param, consumed and stripped (not durable state)
…/inbox?upgrade=<plus|pro>   (or bare ?upgrade)
  on mount: validate tier enum → openPaywall({ highlightTier })
            → navigate({ search: drop "upgrade" }, { replace: true })
  anonymous: landing CTA → /login (callbackURL "/inbox?upgrade=pro") → after auth, trigger fires
  No tier/interval as durable URL state; the modal is a UI overlay, not a page.
```

## Scope / non-goals

- **Design is locked (2026-06-09); implementation not started.**
- Does **not** re-decide which features are gated or at which tier (that lives in `TIER_CAPABILITIES`).
- Does **not** change billing/Stripe plumbing (`changePlan`, checkout/portal endpoints, webhook stay); it standardizes how users _reach_ them and the surface they reach it through.

## Open questions & locked-decision alignment (2026-06-09)

### Must obey already-locked billing decisions (not open — the design was partly out of step)

- **Pricing framing is locked** ([[project_billing_stripe_phase2]], 2026-06-08): show the **annual total** ($50/yr, $120/yr) with strikethrough full-annual ($60 / $144) + "Save 17%" pill — **not** a per-month "$4.17/mo" breakdown. The 2026-06-09 mockup's "$4/mo (was $5)" framing is superseded by this.
- **No self-serve interval switch is locked:** the month↔year toggle shows to **free / new** purchasers only. Paid users see their current interval + "switching = contact support" (exactly what `plan-section.tsx` does). Tier changes preserve the existing interval.
- **No free trial is locked** (Free tier _is_ the trial) → checkout stays trial-less.
- **Today's "paywall" already exists = Settings → Plan.** There is no standalone Zustand plan dialog (that earlier note was stale). Every in-app upsell routes to `useSettingsDialog().openAt("plan")` via the shared `UpgradeCta`. `PlanSection` is already a full tier-aware chooser (current/upgrade/downgrade, cancel/resume, interval note). The consolidation **reframes**: build an isolated acquisition surface and point the existing `UpgradeCta` / promos / sidebar / landing at it — not build a chooser from scratch.
- **No client-side 402 handling exists** — in-app gates are client capability checks (`useOrgFeatures().capabilities` → `UpgradeCta`). The "402 → paywall" interceptor has **no in-app consumer**; 402s only reach external clients (Raycast/Telegram/API/extension). Scope that bridge to external surfaces; deprioritize for the web app.

### Resolved 2026-06-09

1. **Acquisition modal ↔ Settings → Plan** → **dedicated modal for acquisition; Settings keeps management.** Shared `PlanCards` core. `UpgradeCta`/promos/sidebar/landing repoint to `openPaywall`.
2. **Interval / tier as link state** → **no durable URL state.** A one-shot `?upgrade[=tier]` trigger opens the modal and is stripped; interval is never in the link (free→yearly default, paid→locked interval). Resolves the interval-conflict by construction.
3. **Promo / discount** → **none.** The $50/$120 annual prices are already the discounted prices on the Stripe side (17% = annual-vs-monthly saving, baked in). No checkout coupon, no `allow_promotion_codes` lever for now.

### Still open (need a decision)

3. **Modal scope.** Upsell-only (Upgrade/Switch buttons), or also downgrade/cancel/resume inline? _Rec: upsell-only; management stays in Settings._
4. **"Upgrade" entry placement** → settled: a UI detail, decide at build (likely a top-bar button before the user menu; we have no left sidebar). Behavior: shown for free/plus, hidden for pro.
5. **Card layout.** Side-by-side Plus | Pro (Pro hero — marketer/competitor) vs Settings' Pro-on-top / Plus-secondary. _Rec: 2-up side-by-side for the modal._
6. **Chat soft-gate threshold.** Gate on open / type / send / response? _Rec: let them open + type + send, gate the response (competitor pattern, img #5)._
7. **Funnel instrumentation.** Track paywall*view → plan_selected → checkout_started → upgraded (ties to [[project_admin_dashboard_cohorts]])? \_Rec: yes, lightweight.*
8. **Canceling/resume user opens the modal** → punt to Settings, or handle inline? _Rec: punt to Settings._

## Build order (when picked up)

1. **Contract** — add `requiredTierFor(capability)` to `src/lib/plan.ts` (have `requiredTierForBooleanCap` already); ensure server `requireCapability` and client `useCapabilityGate` read the same map.
2. **Surface** — extract the landing price/savings/strikethrough card into a shared `PlanCards` core (reused by landing + modal + Settings); build `<PaywallModal>` (Dialog + `vaul` Drawer) + `usePaywall` store; render Plus/Pro two-up per the mockup, reading `useOrgFeatures().tier` for button states.
3. **Trigger** — a one-shot `?upgrade[=tier]` reader at the app shell: validate enum → `openPaywall({ highlightTier })` → strip the param via `navigate({ replace: true })`. No route, no durable state.
4. **Auth threading** — `/login` reads an `upgrade` hint and sets OAuth `callbackURL = "/inbox?upgrade=<tier>"` (today hardcodes `/inbox`); contextual "Sign in to start Pro" copy.
5. **Landing wiring** — `CTA_BY_TIER` plus/pro → `/login` with the upgrade hint; free stays plain `/login`.
6. **Doors** — repoint `UpgradeCta` + `ai-summary-promo.tsx` + agent promo onto `openPaywall`; sidebar "Upgrade" entry; chat ⌘J soft-gate (tease-then-gate).
7. **CRO polish** — `cancel_url` → `/inbox?upgrade=1` (re-opens modal); button double-click guard; a test asserting `PLANS.pricing` ↔ Stripe `priceForTier` parity.

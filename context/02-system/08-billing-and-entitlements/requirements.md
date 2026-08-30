# Billing and Entitlements — Requirements

## Context

Owns pricing tiers, Stripe synchronization, server-enforced capabilities,
administrator overrides, and usage allowances.

## Assumptions

- **CS.SYS.BILL-A01 Workspace subscription:** One subscription and entitlement
  set belong to a workspace, not directly to a user.
  - Validation: organization billing columns and checkout flow.
- **CS.SYS.BILL-A02 Small fixed tier set:** Free, Plus, and Pro remain a small
  version-controlled bundle surface.
  - Validation: [`plan.ts`](../../../src/lib/plan.ts).

## Constraints

- **CS.SYS.BILL-C01 Stripe owns payment state:** Card data and authoritative
  subscription status remain in Stripe; Cloudstash stores mapped operational
  state.
- **CS.SYS.BILL-C02 Worker-compatible Stripe:** Stripe calls use the fetch HTTP
  client and asynchronous webhook verification in the Cloudflare runtime.

## Acceptable Tradeoffs

- **CS.SYS.BILL-T01 Code-defined capabilities:** Tier bundles are
  version-controlled rather than Stripe Entitlements, requiring deployments for
  bundle changes.
- **CS.SYS.BILL-T02 Admin exceptions:** Manual tier grants and per-capability
  overrides can diverge from Stripe intentionally.
- **CS.SYS.BILL-T03 Status mapping:** Active, trialing, and past-due
  subscriptions retain the mapped paid tier; cancelled/unpaid/incomplete states
  map to Free according to current policy.

## Requirements

- **CS.SYS.BILL-R01 Server capability source:** Runtime access must derive from
  D1 tier defaults merged with workspace overrides; product copy is not an auth
  source. `refines: CS-R07`
- **CS.SYS.BILL-R02 Request-time gates:** Paid HTTP and stateful operations must
  check capability at the authoritative boundary and return a structured
  required-tier denial.
- **CS.SYS.BILL-R03 Stripe-free request path:** Normal feature checks must use
  D1. An entitled Assistant request may perform one Stripe refresh only when a
  required billing-cycle projection is missing, then persist it for later reads.
- **CS.SYS.BILL-R04 Live subscription reconciliation:** Stripe events are a
  signal to fetch current subscriptions; webhook payload fields are not copied
  as authority.
- **CS.SYS.BILL-R05 Idempotent writes:** Customer and checkout creation use
  deterministic idempotency keys.
- **CS.SYS.BILL-R06 Customer first:** A workspace Stripe customer must exist and
  carry workspace metadata before Checkout is created.
- **CS.SYS.BILL-R07 Independent admin grants:** Stripe synchronization must
  always maintain the current subscription projection. A manual admin grant is
  stored independently and raises the effective tier without hiding,
  downgrading, or blocking Stripe state.
- **CS.SYS.BILL-R08 Interval mapping:** Monthly/yearly price IDs map to tier and
  billing interval, and tier changes preserve current interval.
- **CS.SYS.BILL-R09 Unknown-price safety:** An active unrecognized Stripe price
  must not silently downgrade or invent a tier; it is logged and preserves the
  current tier pending reconciliation.
- **CS.SYS.BILL-R10 Allowance fail closed:** Bounded chat and enrichment
  operations must enforce their workspace/period allowances; unavailable chat
  allowance state denies model execution.
- **CS.SYS.BILL-R11 Matrix verification:** Tests must lock every default tier
  capability to prevent a shipped path remaining unreachable after a new
  capability is introduced.
- **CS.SYS.BILL-R12 Pricing reconciliation:** Executable plan prices and Stripe
  prices must have an explicit drift check before release/config changes.
- **CS.SYS.BILL-R13 Subscription-aligned usage:** Assistant allowance windows
  must derive from persisted Stripe period/anchor data or, when an admin grant
  supplies the effective paid tier, that grant's anchor. One model run must use
  one immutable window for preflight and settlement.

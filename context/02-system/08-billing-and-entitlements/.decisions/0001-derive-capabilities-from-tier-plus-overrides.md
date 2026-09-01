# Derive runtime capabilities from tier plus workspace overrides

Status: accepted

## Context

Cloudstash needs simple public plans, strict server gates, beta/comps/testing
exceptions, and Stripe billing without scattering tier-name conditionals across
features.

## Evidence and Argument

- [`plan.ts`](../../../../src/lib/plan.ts) separates marketing `PLANS` from the
  runtime `TIER_CAPABILITIES` matrix.
- `Billing.capabilities` is used by HTTP handlers, LinkProcessorDO, ChatAgentDO,
  X sync, and digest scheduling.
- [PR #65](https://github.com/bohdanbirdie/cloudstash/pull/65) shows why the
  full matrix must be tested: X enrichment existed but was false in every tier
  and therefore unreachable.
- Admin overrides support beta access and manual grants without changing global
  plan defaults. Their independent tier-floor storage is refined by
  [decision 0004](./0004-separate-admin-grants-from-stripe-state.md).

## Options

| Option                                                                              | Tradeoffs                                                                                                                    |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Check tier names directly at every feature                                          | Little abstraction, but duplicated policy and inconsistent required-tier/error behavior.                                     |
| Use Stripe Entitlements as the runtime source                                       | Powerful and externally managed, but adds request/reconciliation dependence and overhead for three fixed tiers.              |
| Define capabilities in code, derive from D1 tier, and merge per-workspace overrides | Central, testable, and fast at request time, but bundle changes require code deployment and copy still needs reconciliation. |

## Decision

Use a version-controlled capability matrix as runtime policy. Store the Stripe
tier projection, independent admin tier grant, and sparse capability overrides
in D1. All authoritative gates ask `Billing` for merged capabilities. Preserve
marketing copy as a separate projection and test the entire default matrix.

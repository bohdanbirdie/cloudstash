# Align customer-facing copy with shipped behavior

## Problem and outcome

Customer-facing and repository copy can drift as capabilities, integrations,
billing, and data handling change. Establish one factual reconciliation pass so
availability and policy claims match shipped behavior and executable semantics.

## Agreed scope and non-goals

- Review plan, landing, README, SEO, Terms, policy, and integration copy against
  current Intent, runtime capabilities, billing behavior, and released clients.
- Remove or clearly qualify unavailable claims until their implementations are
  released and verified.
- Assign one remediation owner to each relevant open copy delta and record which
  surface closes or narrows it.
- This task changes copy and factual documentation, not pricing, feature
  implementation, legal interpretation, or entitlement policy.
- MCP implementation remains in [[develop-mcp-server]]; this task owns only the
  interim accuracy of MCP availability copy.

## Agreed constraints

- Executable behavior and current Intent are the factual sources; marketing text
  is not an authorization or availability source.
- Legal/policy wording receives human review after factual corrections are
  prepared.
- Keep high-traffic summaries neutral; detailed evidence remains in the owning
  Intent delta.

## Acceptance criteria

- DELTA-006 and DELTA-025 each have a named remediation owner,
  affected-surface inventory, and factual copy change that resolves or
  explicitly narrows the remaining divergence.
- Plan and landing copy agree with executable tier/capability defaults and
  verified integration availability.
- README and SEO do not present planned clients or broader product semantics as
  shipped.
- Terms and policy copy reflect verified billing/data behavior and are queued for
  human legal approval where judgment is required.
- Copy-focused tests or deterministic checks cover shared plan/SEO projections
  where drift can recur mechanically.

## Dependencies and risks

Depends on current capability and billing evidence plus owners for the affected
product surfaces. Copy may need a second pass after pending implementations
ship; factual reconciliation must not silently redefine product policy.

## Size and uncertainty

Medium. The surface inventory is broad, but changes should remain factual and
localized; legal approval is external to this task.

## Reconciliation notes

- 2026-08-21: whole-Vault Markdown/plain-link export was confirmed; tag/JSON
  claims were removed. The unshipped iOS integration was removed from public
  surfaces. Raycast copy now describes its URL command, the larger Pro summary
  model moved to its own implementation task, and the unsupported
  multi-workspace README claim was removed.
- “Weekly digest of what you read” remains accepted marketing shorthand for a
  digest selected from recently saved links.
- Terms now describe both billing intervals; production annual Stripe/Portal
  verification remains external evidence under DELTA-025.

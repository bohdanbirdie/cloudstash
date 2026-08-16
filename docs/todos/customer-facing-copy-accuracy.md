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

- DELTA-005, DELTA-006, DELTA-007, DELTA-021, and DELTA-025 each have a named
  remediation owner, affected-surface inventory, and factual copy change that
  resolves or explicitly narrows the remaining divergence.
- DELTA-002 availability copy is removed or qualified until MCP is released;
  implementation acceptance remains owned by [[develop-mcp-server]].
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

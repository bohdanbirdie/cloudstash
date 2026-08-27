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
- External dashboard verification and legal approval remain human operations;
  this task owns repository-controlled copy and factual handoff notes.

## Agreed constraints

- Executable behavior and current Intent are the factual sources; marketing text
  is not an authorization or availability source.
- Legal/policy wording receives human review after factual corrections are
  prepared.
- Keep high-traffic summaries neutral; detailed evidence remains in the owning
  Intent delta.

## Completion evidence

- Plan, landing, README, SEO, Terms, privacy, and integration copy now agree
  with executable capabilities and released clients.
- Summary copy describes the user outcome without promising a fixed shape or a
  successful summary for every page.
- Privacy and Terms disclose the AI providers used by summaries and optional AI
  features in plain language.
- Account-deletion copy distinguishes immediate loss of access from the durable
  background purge without inventing a backup-removal deadline.
- Extension privacy copy matches the popup's URL/title/favicon read on open;
  the external Chrome Web Store listing remains a human verification under
  DELTA-017.
- Visible FAQ and structured FAQ data share one source. A deterministic test
  also checks structured plan prices against executable plan values and blocks
  the known absolute summary/deletion claims.

## Remaining external verification

- DELTA-025: verify production annual Stripe prices and Portal behavior.
- DELTA-017: verify or update the published Chrome Web Store listing.
- Human legal review of the corrected Terms and Privacy wording.

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
- 2026-08-28: removed fixed-length and every-save summary promises; aligned AI
  provider, deletion, extension, and Vault/workspace terminology; deduplicated
  visible/structured FAQ copy; and added deterministic drift checks.

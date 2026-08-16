# Extend admin purchase attribution

## Problem and outcome

The existing admin dashboard has aggregate product evidence but lacks the final
steps needed to explain which acquisition path starts and completes purchase.
Add only bounded aggregate purchase-attribution evidence.

## Agreed scope and non-goals

- Reuse the existing admin dashboard and aggregate activity model.
- Connect paywall/plan entry, checkout start, Stripe reconciliation, and resulting
  tier with coarse source/campaign context where already available.
- Add minimal allowance-exhausted and upgrade-started aggregates with the Free
  summary work.
- No new analytics product, raw URL/content capture, session replay, or per-user
  behavioral feed.

## Agreed constraints

- Extend rather than replace the current dashboard.
- Instrument only evidence needed for purchase attribution and Free-summary
  conversion; telemetry minimization remains the governing constraint.

## Acceptance criteria

- Dashboard reports a documented aggregate funnel with clear event definitions
  and deduplication/reconciliation rules.
- Checkout starts and successful paid reconciliation can be attributed to the
  approved coarse entry source without treating client events as payment truth.
- Free allowance exhaustion and subsequent upgrade starts are visible as
  aggregates.
- No raw Vault content, credentials, or unnecessary stable identifiers are
  stored or rendered.
- Tests cover duplicate callbacks, abandonment, and Stripe-as-authority mapping.

## Dependencies and risks

Depends on [[free-ai-summary-allowance]], shipped paywall acquisition, Stripe
reconciliation, and [[telemetry-minimization]]. Attribution will be incomplete
where privacy-preserving source context is unavailable.

## Size and uncertainty

Medium. Dashboard extension is small; trustworthy event reconciliation is the
main uncertainty.

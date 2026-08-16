# Plan a bounded Free AI-summary allowance

## Problem and outcome

Free saved-link count is currently uncapped, while basic AI summaries are not a
Free capability. Plan a bounded monthly allowance that preserves every saved
link after exhaustion.

## Agreed scope and non-goals

- Keep saved-link count unlimited.
- Define the allowance and period in executable configuration and customer copy,
  then reserve it atomically at the provider boundary.
- Paid summary behavior remains capability-driven; X enrichment and chat keep
  their separate budgets.
- Show a calm allowance-exhausted/next-period/upgrade state; do not turn it into
  a processing error or retry loop.
- Emit only minimal aggregate evidence for allowance exhausted and upgrade
  started; no content-bearing event feed.

## Agreed constraints

- Do not introduce a saved-link count cap as part of summary cost control.
- Allowance value and calendar, billing-aligned, or rolling period semantics land
  with implementation and customer-facing copy, not this planning brief.

## Acceptance criteria

- Tier defaults/copy expose the Free allowance without implying a link limit.
- Concurrent processing cannot execute beyond the configured allowance.
- Period rollover works deterministically and failed/reserved calls follow a
  documented reconciliation rule.
- Exhaustion preserves metadata, saved-link state, and a calm user-visible state.
- Admin aggregates show allowance exhaustion and upgrade starts without URLs or
  stable user-level content history.
- Matrix, concurrency, rollover, downgrade/upgrade, and UI-state tests pass.

## Dependencies and risks

Coordinate with [[paid-capability-enforcement]] and
[[admin-purchase-attribution]]. Storage location and reservation reconciliation
must survive DO eviction and avoid duplicate provider spend.

## Size and uncertainty

Medium-large. Allowance policy, atomic accounting, and UI state are the main
implementation work.

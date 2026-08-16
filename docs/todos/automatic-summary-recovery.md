# Automatic failed-summary recovery

## Problem and outcome

A hanging primary summary attempt can consume the whole execution window, and
normal users should not need to understand or operate a technical retry flow.
Make recovery bounded and automatic, ending in a calm durable state.

## Agreed scope and non-goals

- Give the primary model its own bounded attempt budget.
- On eligible primary failure/timeout, try one bounded fallback.
- Permit only a small, explicitly capped automatic retry policy across durable
  processing recovery.
- Persist a calm terminal no-summary state when the bounded sequence is spent.
- No normal-user technical retry controls, provider names, stack details, or
  indefinite reprocessing loop; admin reprocess may remain an operational tool.

## Agreed constraints

- Recovery order is primary, fallback, limited automatic retry, terminal state.
- Ordinary users should see stable product language, not retry mechanics.

## Acceptance criteria

- A hanging primary leaves enough wall-clock budget for the fallback.
- Fail-fast, timeout, malformed-output, provider-unavailable, and total-budget
  paths have deterministic attempt counts and terminal events.
- Eviction/restart cannot exceed the automatic retry cap.
- Metadata and the saved link remain available throughout.
- User UI settles without a spinner or technical retry button; logs retain safe
  operator diagnostics.

## Dependencies and risks

Coordinate per-attempt timeouts with Worker/DO limits and current stale recovery.
The retry counter must be durable and avoid multiplying provider cost.

## Size and uncertainty

Medium. The primary/fallback path exists; durable retry accounting and product
state need care.

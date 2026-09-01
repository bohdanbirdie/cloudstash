# Align Assistant credits with the subscription cycle

Status: accepted

## Context

Assistant credits were initially grouped by UTC calendar month. That makes the
displayed reset unrelated to the customer's subscription and makes annual plans
ambiguous: Stripe renews the subscription yearly, while Cloudstash promises a
monthly Assistant allowance.

## Evidence and Argument

- Stripe subscription items expose the authoritative current period start and
  end; subscriptions expose a stable billing-cycle anchor.
- Annual subscriptions do not create monthly Stripe renewals, so Cloudstash
  must derive its own monthly allowance windows inside the annual period.
- Computing a calendar month at preflight and again at settlement can split a
  model run that crosses midnight across two ledgers.
- Per-user Stripe keys or a separate reservation system would add lifecycle and
  concurrency complexity without improving the reset semantics.

## Options

| Option                                                                     | Tradeoffs                                                                                                                                                 |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep UTC calendar-month windows                                            | Simple and local, but reset dates disagree with the customer's billing cycle and annual subscriptions remain ambiguous.                                   |
| Create one capped OpenRouter key per user                                  | Delegates hard limits, but adds provider-key lifecycle, cleanup, and another source of billing state without solving subscription-aligned reset dates.    |
| Persist Stripe cycle facts and derive one immutable monthly window per run | Keeps Stripe as the billing source of truth, supports annual plans without synthetic renewals, and requires only one lazy refresh for legacy projections. |

## Decision

Persist the selected Stripe item's period start/end and the subscription
billing-cycle anchor in the operational organization projection. Monthly plans
use the exact Stripe item period. Annual plans derive UTC monthly recurrences
from the billing anchor, clamp end-of-month dates, and bound each window inside
the active annual period. Admin paid-tier grants persist their grant timestamp
as the anchor; legacy grants use workspace creation time.

Resolve one window before a model run and carry its ID through the spend check
and idempotent settlement. If an existing Stripe-backed paid workspace lacks the
new projection, refresh it from Stripe once and persist it. If the projection
still cannot be established, fail closed.

## Consequences

- Reset dates match subscription timing for monthly customers and are stable
  monthly subwindows for annual customers.
- A long turn cannot move accounting periods while it runs.
- The first Assistant request after migration may make one additional Stripe
  read for an existing paid workspace; ordinary later requests remain D1-only.
- Leap-day and end-of-month recurrence behavior is explicit and testable.

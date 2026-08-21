# Give Pro summaries a larger model

## Outcome

Make the advertised larger summary model a real Pro capability while keeping
Plus summaries fast and affordable.

## Scope

- Select the Pro model/provider and define which summary operations use it.
- Enforce the Pro entitlement at operation time, including downgrade behavior.
- Define cost limits, timeout/fallback behavior, and output compatibility with
  existing summaries.
- Compare quality and latency against the standard summary path with a bounded
  evaluation set.
- Restore the Pro plan claim only after the capability and its tests ship.

## Non-goal

Eligible X links already receive enriched summaries; this task owns broader Pro
summary-model differentiation.

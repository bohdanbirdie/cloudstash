# Align Raycast source and entitlement semantics

## Problem and outcome

Raycast Store publication and ordinary paid use work, but pairing and save paths
do not yet share one source/entitlement contract. Preserve Raycast attribution
and make override behavior consistent at pair and operation time.

## Agreed scope and non-goals

- Read trusted connection metadata at ingest and emit `raycast` for Raycast
  captures.
- Choose and enforce one entitlement contract consistently at connection
  and every save, including overrides/downgrades.
- Keep current workspace access checks and stable client-facing denials.
- Update analytics/API responses and tests that depend on source.
- No Store publication work or broad Raycast client redesign.

## Agreed constraints

- Publication is complete and ordinary Plus/Pro functionality works.
- This task changes server semantics, not Store publication.

## Acceptance criteria

- Raycast capture records `source: raycast`; direct public API remains `api`.
- Every override combination has one predictable pair/use result and cannot
  produce a newly connected but unusable client.
- Downgrade/revocation blocks the next operation with stable client-facing UX.
- Source analytics and response contracts are updated without trusting
  caller-supplied source text.
- DELTA-036 resolves.

## Dependencies and risks

Coordinate with [[paid-capability-enforcement]]. Changing which capability owns
Raycast can affect existing overrides and requires a migration/communication
decision if such overrides exist.

## Size and uncertainty

Small-medium. Source preservation is direct; override compatibility is the main
uncertainty.

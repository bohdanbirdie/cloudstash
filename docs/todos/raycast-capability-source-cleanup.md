# Align Raycast source and entitlement semantics

## Outcome

Completed on `fix/paid-operation-enforcement`: pairing and every save share the
`integrations` contract, trusted key metadata preserves Raycast attribution, and
direct API keys continue to use `publicApi`.

## Agreed scope and non-goals

- [x] Read trusted connection metadata at ingest and emit `raycast` for Raycast
      captures.
- [x] Choose and enforce one entitlement contract consistently at connection
      and every save, including overrides/downgrades.
- [x] Keep current workspace access checks and stable client-facing denials.
- [x] Update queued source contracts and tests that depend on source.
- [x] Avoid Store publication work or broad Raycast client redesign.

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

DELTA-036 is resolved. The direct API and Raycast regression matrix locks the
capability split and trusted source behavior.

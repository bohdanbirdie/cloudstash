# Canonical URL identity across capture paths

## Problem and outcome

Web, Chrome, API, Raycast, Telegram, X, and chat normalize or compare URLs
differently, while LiveStore uniqueness is exact-string only. Define one URL
identity and prevent new equivalent duplicates everywhere.

## Agreed scope and non-goals

- Specify one shared HTTP(S) parse, canonical-storage, and dedupe-key contract,
  including scheme, host/`www`, default port, path slash, query, fragment,
  percent encoding, and provider-specific URLs.
- Apply it before every capture commit/queue enqueue and at authoritative
  materialization/processor boundaries.
- Preserve source attribution and return existing-link/idempotent outcomes
  consistently.
- Prevent new duplicates first. Historical merge/backfill and conflict policy
  require a separate explicit decision and are not implied by this task.

## Agreed constraints

- One identity contract must cover every capture path.
- Do not silently reconcile existing duplicate history without a separate
  approved migration decision.

## Acceptance criteria

- A table-driven canonicalization corpus runs against every capture adapter and
  the authoritative store boundary.
- Equivalent URLs converge to one visible link; deliberately distinct query or
  provider identities remain distinct according to the approved table.
- Archived-link resave semantics are explicit and tested.
- New events store canonical URL plus any separately required original/display
  value without breaking export or source notification.
- DELTA-022 resolves for new capture; historical duplicates remain documented if
  no migration is approved.

## Dependencies and risks

Requires a schema/event compatibility decision and careful treatment of signed
URLs, trackers, fragments, provider IDs, and existing exact-URL indexes.

## Size and uncertainty

Large. New-capture convergence is bounded; backward compatibility and historical
reconciliation are high uncertainty.

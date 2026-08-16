# Enforce paid capabilities and budgets at operation time

## Problem and outcome

Operation-time enforcement and atomic reservation remain incomplete for selected
long-lived and cost-bearing paths. Make current workspace access, capability,
and budget authoritative at each protected operation.

## Agreed scope and non-goals

- Inventory all paid HTTP, alarm, queue, WebSocket, integration, digest, chat,
  summary, and enrichment operations.
- Recheck current membership/approval and capability at the authoritative
  operation boundary, including established sync/integration lifetimes.
- Design revocation for established sync connections without reconnect storms or
  cross-tenant routing.
- Reserve cost-bearing period budgets atomically before provider execution and
  reconcile actual use where applicable.
- No broad billing redesign or Stripe call on normal request paths.

## Agreed constraints

- A successful connection is not a permanent entitlement lease.
- Expensive-feature limits must hold under concurrency.

## Acceptance criteria

- A matrix names every paid operation, its authoritative gate, denial protocol,
  and reauthorization cadence.
- Downgrade, override removal, approval withdrawal, and membership revocation
  stop the next operation and terminate/refresh established sync safely.
- Concurrent reservations cannot exceed configured budgets.
- Backend unavailability remains distinct from terminal denial.
- Adversarial tests cover HTTP, alarms/queues, and established connections.

## Dependencies and risks

Tracks DELTA-011, DELTA-015, DELTA-024, and DELTA-037. WebSocket revocation
semantics need LiveStore-aware design; aggressive checks can create reconnect or
backend-load loops.

## Size and uncertainty

Large. Request gates are straightforward; established connection revocation and
distributed atomic budgets are high uncertainty.

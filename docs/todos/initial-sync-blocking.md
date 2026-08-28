# Research HTTP bootstrap and preloaded library state

## Problem and outcome

Fresh clients replay total LiveStore history and can render partial state after
the current Blocking timeout. Establish which cost dominates and whether
supported HTTP replay, clearer boot UX, or an upstream snapshot-at-head protocol
can materially improve p95 fresh-device readiness.

## Agreed scope and non-goals

- Benchmark current WebSocket replay against supported `makeHttpSync` replay on
  the same authenticated `/sync` endpoint.
- Measure BootStatus/progress and timeout UX separately from transport.
- Explore a true authoritative snapshot paired with backend ID and exact event
  head only with LiveStore upstream.
- No assumption that HTTP returns materialized state: it currently streams the
  same eventlog and remains O(history).
- No unproven HTTP-bootstrap-to-WebSocket handoff or app-specific second source
  of truth in production.

## Agreed constraints

- This is a research spike, not a committed snapshot implementation.
- Preserve unresolved choices about readiness UI and timeout behavior.

## Acceptance criteria

- Fresh OPFS fixtures cover representative live links, current event volume,
  and churn-heavy histories; results include bytes/events, first batch, NoMore,
  materialization CPU, partial-render time, and full-ready p50/p95.
- HTTP-only A/B records polling, chunk, timeout, and replay behavior.
- BootStatus/timeout options have an evidence-backed UX recommendation.
- Snapshot feasibility names manifest/version/head consistency, pristine-store
  import, pending-event protection, concurrency, corruption fallback, multi-tab,
  auth/privacy, storage, and generation-cost constraints.
- A written stop/proceed decision states whether to pursue upstream work.

## Dependencies and risks

Requires representative histories and LiveStore maintainer input for any remote
checkpoint/import hook. Current SyncBackendDO stores events, not materialized
Cloudstash state.

## Size and uncertainty

Medium research; a true snapshot protocol would be extra-large and high
uncertainty.

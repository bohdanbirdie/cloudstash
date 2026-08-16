# Align metadata preview with the authenticated bounded-fetch contract

## Problem and outcome

The metadata preview helper does not yet meet Cloudstash's authenticated,
bounded-fetch contract. Require normal application authentication and align its
network limits with the processing path without degrading ordinary preview UX.

## Agreed scope and non-goals

- Require the normal authenticated workspace/session boundary before fetch or
  cache access.
- Apply generous, UX-safe per-user/workspace rate protection with structured
  retry guidance; avoid reconnect/self-amplifying limits.
- Accept only HTTP(S), validate every redirect hop, and bound redirects, time,
  response bytes, content type, and cache behavior.
- Remove raw target URLs from normal telemetry and add hostile-target tests.
- Do not make this endpoint authoritative for LinkProcessor enrichment or retain
  unintended public access.

## Agreed constraints

- Authentication and fetch bounds are one contract at the preview boundary.
- Rate limiting should stop abuse, not punish normal preview bursts.

## Acceptance criteria

- Unauthenticated and hostile protocol, redirect, size, time, and rate-limit
  cases fail before unbounded outbound work.
- Normal authenticated preview bursts succeed within a documented envelope and
  rate-limit responses include a calm retry path.
- Success caching remains bounded and cannot bypass authentication or target
  validation.
- Logs/spans contain safe error context but no raw target URL.
- Unit and Worker tests close DELTA-026's resolution signal.

## Dependencies and risks

Reuse the shared metadata/content fetch safety primitives where their contracts
fit. Browser UI request credentials and cache-key tenancy must be verified.

## Size and uncertainty

Medium. Fetch bounding is known; choosing a generous production limit without
traffic evidence is the main uncertainty.

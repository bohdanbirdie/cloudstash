# Align metadata preview with the authenticated bounded-fetch contract

## Status

Implemented. The internal preview now uses the shared workspace/session
decision, dedicated per-user abuse protection, non-cacheable responses, and the
same bounded-fetch primitive as processing. LinkProcessor remains authoritative.

## Problem and outcome

The metadata preview helper does not yet meet Cloudstash's authenticated,
bounded-fetch contract. Require normal application authentication and align its
network limits with the processing path without degrading ordinary preview UX.

## Agreed scope and non-goals

- Require the normal authenticated workspace/session boundary before fetch or
  cache access.
- Apply generous, UX-safe per-user rate protection with structured
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
- Responses cannot be reused from cache to bypass a later authentication or
  target-validation decision.
- Logs/spans contain safe error context but no raw target URL.
- Unit and Worker tests close DELTA-026's resolution signal.

## Dependencies and risks

The browser's same-origin request supplies the existing session. The endpoint
does not introduce a cache key or a second public contract.

## Size and uncertainty

Delivered as Medium. The platform limiter is intentionally abuse protection,
not global usage accounting; its operational envelope can be tuned from traffic
evidence without changing the product contract.

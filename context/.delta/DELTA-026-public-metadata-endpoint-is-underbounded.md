# DELTA-026: Public metadata endpoint is underbounded

Status: open

## Divergence

`GET /api/metadata` is an unauthenticated fetch proxy outside selected rate-limit
prefixes. Unlike processing extraction, it does not explicitly enforce HTTP(S),
redirect, timeout, or response-size bounds before fetching an arbitrary target.

## Intent

[CS.SYS-R06 and CS.SYS-R09](../02-system/requirements.md),
[CS-R10](../requirements.md), and
[CS.OPS-R08](../03-operations/requirements.md) require validation, bounded
network effects, and abuse protection at untrusted boundaries.

## Implementation

[`cf-worker/index.ts`](../../src/cf-worker/index.ts) exposes the route publicly.
[`metadata/service.ts`](../../src/cf-worker/metadata/service.ts) calls
`fetch(targetUrl)` with cache behavior but without the content extractor's
protocol/redirect/body/time controls, and records the full URL in telemetry.

## Direction

update implementation

## Resolution Signal

Delete this delta when public/auth status is deliberate, only HTTP(S) targets are
accepted, redirects/body/time are bounded, abuse protection applies, raw target
URLs are excluded from telemetry, and hostile-target tests cover the boundary.

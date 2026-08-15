# DELTA-028: Named Effect spans are not exported

Status: open

## Divergence

The application creates named Effect spans but configures a no-op global tracer.
Cloudflare invocation traces and structured logs exist, but no OTLP/export layer
turns those application spans into queryable operational evidence.

## Intent

[CS.OPS-R05 and CS.OPS-R06](../03-operations/requirements.md) require named,
queryable telemetry for critical failures.

## Implementation

[`tracing.ts`](../../src/cf-worker/tracing.ts) documents and installs the no-op
global tracer. `AppLayerLive` does not configure an external span exporter,
while `wrangler.jsonc` enables Cloudflare's built-in logs/traces.

## Direction

update implementation

## Resolution Signal

Delete this delta when a Worker-compatible exporter makes named Effect spans
queryable with bounded/redacted attributes and operational tests prove critical
span/error lookup. Choosing logs/invocation traces instead requires an explicit
Intent requirement change before closing this implementation delta.

# Trial evlog for application wide events

Status: accepted

## Context

Cloudflare already captures Worker invocation logs and can export platform logs
and traces through native OpenTelemetry drains. That transport does not build a
single application event over the lifetime of a request, attach Cloudstash
business outcomes, enforce an application field contract, or redact fields
before `console` emission. The previous wide-logging pull request attempted to
build those lifecycle and context facilities locally, mixed several logging
models, and included raw personal or high-cardinality identifiers.

## Evidence and Argument

- [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
  extracts fields from structured objects emitted through `console` and indexes
  them without a fixed cardinality limit.
- [Cloudflare native OpenTelemetry export](https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/)
  forwards platform logs and traces to an OTLP endpoint; it is the delivery
  layer, not an application request-context builder.
- [evlog's Workers integration](https://www.evlog.dev/integrate/frameworks/cloudflare-workers)
  owns request completion, including streaming responses, and emits structured
  objects suitable for Workers Logs.
- [Wide-event guidance](https://www.evlog.dev/learn/wide-events) favors one
  context-rich application event per operation over reconstructing an outcome
  from scattered lines.
- Cloudstash already enables `nodejs_compat`, so a request-local adapter can
  bridge explicit Effect annotations into the current event without adding a
  new runtime compatibility flag.

## Options

| Option                                                     | Tradeoffs                                                                                                                                                |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Use only Cloudflare invocation logs and native OTLP export | No application dependency, but business outcomes remain split across separate records and Cloudflare cannot redact application data before it is logged. |
| Build a Cloudstash request-context logger                  | Full control, but duplicates lifecycle, streaming completion, redaction, and emission code before the idea has proved useful.                            |
| Send events through an evlog vendor drain                  | Provides a ready backend, but duplicates Cloudflare's transport and adds another external data path.                                                     |
| Trial evlog locally and retain Cloudflare transport        | Reuses the application lifecycle while keeping storage/export unchanged and the dependency removable behind one adapter.                                 |

## Decision

Trial an exact-pinned evlog version behind
`src/cf-worker/observability/wide-event.ts`. Emit one application wide event for
each top-level HTTP, Queue, and scheduled operation as a structured `console`
object; retain Cloudflare Workers Logs and native OTLP export as the only
transport. Add only typed, explicitly selected Cloudstash dimensions, use
registered route templates instead of concrete paths, reject caller-provided
request IDs, and redact sensitive or content-bearing fields before emission.
Do not enable an evlog network drain or copy arbitrary Effect log annotations
into the event. Keep ordinary Effect logs for diagnostic detail while the trial
establishes whether wide events materially improve incident queries. Expand the
boundary to Durable Objects or Workflows only after that evidence exists.

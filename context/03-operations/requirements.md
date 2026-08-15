# Operations — Requirements

## Context

Owns Cloudflare resources, runtime resilience, observability, capacity, incident
response, and deletion/recovery operation.

## Assumptions

- **CS.OPS-A01 Small operator surface:** A maintainer operates the production
  service and needs high-signal automatic evidence rather than a large manual
  on-call process.
  - Validation: current admin dashboard, scripts, logs, and incident workflow.

## Constraints

- **CS.OPS-C01 Cloudflare quotas:** Worker/DO/D1/Queue/KV/AI limits and billing
  behavior constrain the service. Current relevant facts are captured in
  [the Cloudflare reference](./.reference/cloudflare-resource-envelopes.md).
- **CS.OPS-C02 No guaranteed isolate residence:** Eviction and hibernation are
  normal and may occur between any two external events.
- **CS.OPS-C03 Secrets out of Git:** OAuth, Stripe, Telegram, AI, analytics, and
  signing secrets are deployment secrets, never committed configuration.

## Acceptable Tradeoffs

- **CS.OPS-T01 Aggregate analytics:** Product analytics mirrors selected event
  facts fire-and-forget into D1 and may lag; it never delays sync acceptance.
- **CS.OPS-T02 Hibernation over memory cache:** Reconstructing state after wake
  is accepted to reduce idle Durable Object duration.
- **CS.OPS-T03 Best-effort telemetry:** Analytics/tracing failure must not fail a
  user operation unless telemetry is itself the operation.

## Requirements

- **CS.OPS-R01 Declarative resources:** Bindings, migrations, queue consumers,
  variables, compatibility flags, and observability are declared in
  `wrangler.jsonc` and generated types are kept current.
- **CS.OPS-R02 Hibernation:** Idle SyncBackendDO WebSockets must hibernate and
  remain live after wake. `refines: CS.SYS.SYNC-R06`
- **CS.OPS-R03 Quota-aware migrations:** LiveStore schema/runtime changes that
  trigger full rematerialization require a rows-written estimate and staged
  operational plan.
- **CS.OPS-R04 Durable intake window:** Queue retry schedules, DLQ consumer, and
  retention must agree and expose exhaustion risk.
- **CS.OPS-R05 Structured telemetry:** Worker and Effect operations emit named
  spans/logs with typed context and avoid raw personal data or secrets.
- **CS.OPS-R06 Failure tripwires:** DLQ re-drive, sync lag, abnormal WebSocket
  teardown, quota errors, and deletion workflow errors must be queryable and
  have an owner/recovery direction.
- **CS.OPS-R07 Aggregate privacy:** Admin analytics may expose counts, rates,
  shares, tier/source breakdowns, and cohorts, but not user content or a
  per-event content feed.
- **CS.OPS-R08 Rate protection:** Apply rate limits to abuse-prone request
  surfaces without turning normal sync reconnects into self-sustaining failure
  storms.
- **CS.OPS-R09 Degraded behavior:** Metadata/AI/notification/analytics failures
  should preserve durable accepted links when their contract allows.
- **CS.OPS-R10 Recovery evidence:** Incidents record impact, timeline/root cause,
  corrective action, verification, and remaining drift in the owning Intent
  node or delta.
- **CS.OPS-R11 Staging need:** Changes whose critical behavior cannot be proven
  locally require preview/staging or a bounded production verification plan.

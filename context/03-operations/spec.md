# Operations — Spec

This document specifies production resources and operational behavior. It builds
on [requirements.md](./requirements.md).

## Status

Active.

## Cloudflare Resources

| Resource         | Binding/name                                                         | Operational purpose                                               |
| ---------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Worker + Assets  | `cloudstash`, `ASSETS`                                               | SPA/public assets, API, sync/agent routing, queue consumption     |
| Workers AI       | `AI`                                                                 | Basic summary structured output                                   |
| Durable Objects  | `SYNC_BACKEND_DO`, `LINK_PROCESSOR_DO`, `Chat`, `X_BOOKMARK_SYNC_DO` | workspace sync/link operations/processing/chat and user X polling |
| Workflow         | `ACCOUNT_DELETION`                                                   | durable multi-store deletion                                      |
| D1               | `DB`                                                                 | control plane and aggregate activity                              |
| KV               | `TELEGRAM_KV`, `ENRICHMENT_USAGE`                                    | integration mapping/deletion index and enrichment usage           |
| Queue            | `LINK_QUEUE` plus `cloudstash-link-dlq`                              | external intake and long recovery                                 |
| Rate limiter     | `SYNC_RATE_LIMITER`                                                  | selected auth/MCP/sync/invite abuse protection                    |
| Analytics Engine | `USAGE_ANALYTICS`                                                    | low-overhead usage events                                         |

Built-in Cloudflare logs and invocation traces are enabled with full head
sampling in current configuration. `AppLayerLive` installs application services
and structured logging, but the global Effect tracer is currently a no-op; named
Effect spans are not exported through a configured OTLP backend.

## Resilience Layers

- Better Auth's signed five-minute cookie cache lowers D1/CPU load on session
  validation.
- Per-IP rate limiting covers selected paths; Better Auth per-key limiting is
  disabled because extension reconnect churn previously created a permanent
  denial/retry storm.
- LiveStore retries use jittered exponential backoff and WebSocket hibernation.
- Queue main/DLQ retry handles transient processor outages.
- Link processing bounds fetch/AI concurrency and I/O duration.
- Durable Workflows retry named deletion steps.
- Materializers and ingestion are idempotent under rebase/retry.

## Observability

Operational evidence includes Cloudflare invocation logs/traces, structured
Effect logs, Analytics Engine usage, aggregate D1 activity, DO rows-written
counters/logs, queue attempt/delay logs, and scripts such as
`scripts/do-metrics.sh`. Current telemetry is not yet compliant with the
minimization requirement: several paths log full URLs or stable identifiers
([DELTA-016](../.delta/DELTA-016-telemetry-emits-raw-content-and-identifiers.md)),
and D1 activity stores link IDs/domain metadata that survive deletion
([DELTA-013](../.delta/DELTA-013-activity-analytics-retain-content-after-deletion.md)).

The SyncBackendDO logs event names/batch size, live long-timer count, and large
processor-parent gaps. DLQ re-drive logs at error level. These are current
tripwires; alert delivery remains roadmap work rather than a spec claim.

## Capacity and Change Safety

The most dangerous changes are those that rebuild a full LiveStore read model in
DO SQLite. Before a schema-hash/runtime transition, estimate events × logical
writes × affected client DOs and account for the account-wide daily write cap.
The August 2026 Effect v4 cutover exceeded the cap through two full
rematerializations despite normal per-event VFS behavior.

The build reports bundle size, but no repository assertion currently compares
compressed size with the deployed plan's limit; see
[DELTA-020](../.delta/DELTA-020-release-path-can-deploy-uncertified-artifacts.md).
Changing DO SQLite schema in vendored LiveStore requires the upstream persistence
format version to change; local cleanup is not a production migration strategy.

## Incident Routing

Historical incidents remain under `docs/incidents/` or detailed architecture
postmortems. Durable lessons are promoted into this node, the relevant system
node, a decision, or an open delta. Completed incident tasks do not stay as
closed deltas.

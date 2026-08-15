# Use Cloudflare Queues as the durable external-intake record

Status: accepted

## Context

Telegram, Raycast, public API, and X bookmark producers need to accept work even
when the workspace processor is unavailable. A previous queue configuration
exhausted short retries, moved messages to an unconsumed DLQ, and silently lost
them after retention expiry.

## Evidence and Argument

- [PR #84](https://github.com/bohdanbirdie/cloudstash/pull/84) documents the
  outage, retry exhaustion, unconsumed DLQ, and implemented re-drive policy.
- Existing URL-level idempotency makes at-least-once Queue delivery safe.
- A proposed D1 `pending_ingests` ledger would duplicate queue state and require
  its own claim, retry, cleanup, and reconciliation protocol.
- Queue acceptance gives source handlers a durable boundary without keeping a
  request or browser alive for processing.

## Options

| Option                                                                      | Tradeoffs                                                                                                           |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Call LinkProcessorDO directly from every external request                   | Low latency and little infrastructure, but outages fail sources immediately and producer retries differ.            |
| Add a D1 pending-ingest ledger plus worker/cron claiming                    | Fully queryable, but duplicates Queue responsibilities and adds consistency/cleanup state.                          |
| Keep Cloudflare Queue as the intake record with main retry and consumed DLQ | Uses one durable mechanism and existing idempotency, but recovery is bounded by Queue retention and needs alerting. |

## Decision

Route external intake through `cloudstash-link-queue`; use the Queue as the sole
pending-ingest record. Configure exponential main retries and a consumed DLQ
with long re-drive. Keep dispatcher fallback fail-safe and treat DLQ logs as an
operational tripwire.

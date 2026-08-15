# Cloudflare resource envelopes relevant to Cloudstash

Source: [Cloudflare Queues limits](https://developers.cloudflare.com/queues/platform/limits/),
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/),
`wrangler.jsonc`, and linked Cloudstash incidents; reviewed 2026-08-13.

## Relevant Facts

- Durable Object JavaScript memory is disposable; WebSocket Hibernation can keep
  sockets connected without billing idle isolate residence when no disqualifying
  work such as long timers remains.
- Durable Object SQLite write quotas are account/plan scoped; Cloudstash's free
  account hit the then-current 100,000 rows-written daily cap during full
  rematerialization. See the
  [August incident](../../../docs/incidents/2026-08-10-do-rows-written-cap-v4-cutover.md).
- Worker CPU/memory/bundle/subrequest limits make unbounded extraction and model
  calls unsafe; current code caps content at 5 MB and concurrency separately.
- Queue retry schedules are useful only within message retention. Cloudflare
  currently fixes Workers Free retention at 24 hours; Workers Paid can configure
  up to 14 days. Cloudstash's DLQ design assumes the latter, but deployed plan
  and retention remain unverified.
- Durable Object alarms, Cloudflare Queues, and Workflows persist scheduling or
  work beyond a request/isolate lifetime; ordinary untracked promises do not.
- Exact plan limits and pricing can change. Current values must be rechecked in
  Cloudflare's official docs/dashboard before capacity or migration decisions.

## Intent Impact

These facts constrain [CS.OPS-C01](../requirements.md), hibernation, bounded
processing, queue retention, deletion orchestration, and pre-deploy write-budget
estimates. The record intentionally avoids freezing mutable platform quotas as
timeless requirements.

# Adapt X polling to account activity

Status: accepted

## Context

The X bookmark API provides neither bookmark webhooks nor a server-side
incremental cursor. Cloudstash must therefore poll each connected account, but
a fixed 30-second alarm wakes inactive per-user Durable Objects as often as
active ones. Alarm requests, provider I/O duration, and alarm writes grow with
connected users even when no bookmarks change.

Durable Objects may be evicted between alarms. Healthy cadence and retry state
that live only in memory therefore cannot reliably progress: an evicted actor
can return to the fastest cadence or first retry on every wake.

## Evidence and Argument

- The existing watermark probe detects activity with one bounded provider read
  and already walks all pages back to the watermark after missed intervals.
- Queue checkpointing and watermark advancement make repeated alarm execution
  safe and prevent a longer idle interval from losing new bookmarks.
- Cloudflare alarms are at-least-once, and each actor has only one replaceable
  alarm. Persisting scheduling control before setting that alarm makes eviction
  and duplicate delivery safe.
- A dormant five-minute cadence reduces steady alarm frequency by 90% compared
  with 30 seconds while bounding normal discovery lag to five minutes.
- Connection, pause, entitlement, and repair reconciliation already provide the
  lifecycle boundary; adding another scheduler or database would duplicate it.

## Options

| Option                                               | Tradeoffs                                                                                                                              |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Keep a fixed 30-second alarm                         | Lowest latency and no new state, but every inactive account keeps the maximum request, duration, and alarm-write rate.                 |
| Keep adaptive counters only in memory                | Smallest code change, but eviction can reset both idle cadence and transient retries on every alarm.                                   |
| Persist minimal control in each existing per-user DO | One small state value and transition policy; preserves isolation, cold-start correctness, and repair behavior without another service. |
| Replace per-user alarms with a global scheduler      | Centralizes cadence but adds shared scanning, fan-out, and coordination already rejected by decision 0001.                             |

## Decision

Persist one `pollControl` value in each `XBookmarkSyncDO`. It records the start
of the current idle period and a bounded transient-failure count. Successful
empty probes poll every 30 seconds for five idle minutes, every minute until 30
idle minutes, every two minutes until six idle hours, then every five minutes.
Any observed bookmark returns to 30 seconds.

Transient failures retain the idle timestamp and back off through one, two,
four, eight, then fifteen minutes. A success clears the failure count. Provider
rate limits do not alter either state and schedule after the greater of the
current adaptive delay or the provider delay plus a small positive buffer.
Authentication/payment failures, pause, entitlement loss, and disconnect retain
their existing stop behavior.

Write polling control only when activity, the first empty probe, or failure
state changes. A stable idle actor therefore adds no control write per poll.
Reactivation resets control to fast polling; repair of a missing alarm on an
already-active actor preserves the persisted cadence and watermark. Invalid or
absent control decodes to the fast default for backward compatibility.

# Reconcile X sync from explicit signals plus periodic repair

Status: accepted

## Context

X bookmark polling is owned by a per-user Durable Object. The original
activation path depended on a Better Auth account-create hook, while ongoing
alarms trusted durable state indefinitely. A missed hook could therefore leave
a valid linked account dormant, and a later downgrade could leave an existing
poller active.

The connection, workspace capability, user pause preference, alarm, and X
credential are independent facts that can change or be delivered more than
once. No single callback is a reliable lifecycle authority.

## Evidence and Argument

- Better Auth can persist an X account even when its database hook does not
  activate the Durable Object in the expected request lifecycle.
- Stripe webhooks and administrator changes update the same D1 entitlement
  projection and may be repeated.
- Cloudflare Queues provide at-least-once delivery, so lifecycle work must be
  idempotent rather than assuming exactly-once delivery.
- Durable Object alarms are a useful per-connection polling clock, but an alarm
  must revalidate current capability before provider I/O.
- A slow scan of linked X accounts is inexpensive at current scale and repairs
  the narrow gap between an authoritative D1 write and a failed Queue send.

## Options

| Option                                                                                                                                     | Tradeoffs                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Rely on the OAuth database hook and existing alarms                                                                                        | Minimal code, but missed activation and stale entitlement state have no repair path.                                            |
| Replace per-user alarms with a global cron poller                                                                                          | Central scheduling, but turns one bounded connection into shared scanning/orchestration and makes active polling less isolated. |
| Reconcile an idempotent per-user DO from explicit OAuth completion, X reconciliation Queue messages, alarm checks, and a daily repair scan | More triggers, but each is cheap and repeatable, the DO remains thin, and missed delivery self-heals.                           |
| Add a transactional outbox before emitting lifecycle work                                                                                  | Closes the D1-write/Queue-send gap precisely, but adds schema and dispatcher complexity beyond the current scale.               |

## Decision

Keep one thin X bookmark Durable Object per user and make `reconcile` its
idempotent control boundary. Reconciliation derives effective activity from
the linked account, the bound workspace's current `xBookmarkSync` capability,
and the user's independently persisted pause preference. It initializes
identity/watermark only when needed, arms a missing alarm only for an entitled
and enabled connection, and removes alarms otherwise.

Invoke reconciliation after the explicit OAuth return, after entitlement
changes through an at-least-once X reconciliation Queue, before alarm provider work,
and from a daily linked-account repair scan. Queue-send failure does not roll
back the authoritative billing write; the repair scan closes that gap. Defer a
transactional outbox until volume or observed repair lag justifies it.

Keep an established workspace binding stable across ordinary repair messages,
but release it when the authoritative billing lookup confirms that workspace
was deleted. That terminal reconciliation removes the alarm and permits a
later explicit signal to establish a valid replacement binding.

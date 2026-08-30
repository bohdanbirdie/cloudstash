# Make X bookmark polling adaptive and cold-start resilient

## Goal

Reduce X polling alarms, provider calls, Durable Object duration, and alarm
writes for idle accounts without weakening bookmark delivery or lifecycle
correctness.

## Scope

- Poll quickly after connection or observed activity, then progressively relax
  the cadence while no new bookmarks appear.
- Persist the minimum scheduling control needed to survive Durable Object
  eviction; never depend on an in-memory retry counter.
- Keep rate-limit delays separate from healthy idle cadence and transient-error
  backoff.
- Preserve entitlement reconciliation, pause/resume, reconnect, disconnect,
  daily repair, pagination, Queue checkpointing, and watermark semantics.
- Add deterministic policy tests and a cold-start regression through the real
  Durable Object storage boundary.

## Acceptance criteria

- Activity returns the poller to the fast cadence.
- Sustained inactivity eventually reaches a five-minute cadence.
- Transient failures back off from one minute to a fifteen-minute ceiling and
  continue correctly after eviction.
- A provider rate limit honors its retry delay without mutating or accelerating
  healthy cadence.
- Old Durable Objects without scheduling control default safely to fast polling.
- Pause, entitlement loss, reconnect requirements, and disconnect leave no
  active alarm.
- Daily repair restores a missing alarm without discarding the persisted
  cadence or watermark.

## Sequence

This is the first variable-spend optimization. Complete and review it before
starting `AI-12`, `AI-13`, `AI-14`, or `AI-15`.

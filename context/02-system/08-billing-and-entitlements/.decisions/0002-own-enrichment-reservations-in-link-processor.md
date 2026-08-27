# Own enrichment reservations in LinkProcessorDO

Status: accepted

## Context

X-enrichment provider work is capped per workspace and month. The original KV
read-then-write counter ran concurrently inside LinkProcessorDO and could both
lose increments and admit provider calls beyond the cap.

## Evidence and Argument

- LinkProcessorDO is already the per-workspace owner that schedules bounded
  concurrent metadata and AI work.
- Its SQLite-backed Durable Object storage is private, strongly consistent, and
  transactional across eviction; no cross-workspace coordinator is required.
- Reserving after provider success cannot prevent overspend, while reserving
  before provider work makes storage failure fail closed for enrichment.
- Existing KV counters expire after 70 days and remain reachable only by the
  deletion workflow during the transition; new reservations do not use KV.

## Options

| Option                                                 | Tradeoffs                                                                                                                                    |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep the KV counter and accept approximate enforcement | Minimal change, but concurrent calls can exceed the cap and lose usage.                                                                      |
| Add a dedicated budget Durable Object                  | Atomic, but adds a namespace, RPC hop, deployment binding, and another lifecycle owner per workspace.                                        |
| Reserve in the existing LinkProcessorDO storage        | Atomic at the current workspace coordination owner with no new runtime resource; the cutover starts a fresh counter in the deployment month. |

## Decision

Reserve one X-enrichment attempt transactionally in LinkProcessorDO storage
before provider work. Count a started attempt even if provider or generation
later fails. Fall back to the basic summary when reservation storage is
unavailable or the cap is exhausted. Keep the legacy KV binding only while its
TTL-bounded counters may still need account-deletion cleanup, then remove that
binding and cleanup branch in a separate configuration change.

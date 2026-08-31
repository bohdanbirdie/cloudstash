# Bound X bookmark recovery and admission

Status: accepted

## Context

The X bookmark endpoint has no server-side incremental cursor or bookmark
timestamp. Paging in batches from the newest bookmark to one watermark rereads
known resources, while a deleted/unbookmarked watermark can force a much deeper
walk. A plan also needs one workspace-wide imported-bookmark allowance even
though polling actors are per user.

The maintainer explicitly approved the monthly product bound, recovery
semantics, and provider-read ceiling before this decision changed integration
and billing guarantees.

## Evidence and Argument

- The endpoint returns a pagination token when requested with one result, so an
  exact walk can pay the model-facing/provider-resource cost only for the
  changed prefix and a boundary item.
- A ring of recent successful checkpoints survives one missing bookmark better
  than a single watermark while keeping state bounded.
- Cloudflare alarms are at-least-once. Persisting a traversal before rescheduling
  makes a fixed per-alarm request budget safe across eviction and retry.
- The workspace `LinkProcessorDO` already owns shared library accounting and
  the common Queue binding. Serializing admission there prevents each member's
  per-user poller from receiving a separate allowance.
- Queue delivery is already idempotent at common ingest. If an actor fails after
  Queue acceptance but before recording admission, retrying delivery is safer
  than advancing and losing a bookmark.

## Options

| Option                                                    | Tradeoffs                                                                                                            |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Keep 50-item pages and one watermark                      | Simple, but rereads known data and a missing watermark expands provider work.                                        |
| Walk one item at a time without durable continuation      | Reduces normal reads, but a large changed prefix can exceed one alarm/runtime budget and restart from the head.      |
| Persist exact traversal and enforce per-user allowance    | Recovers safely, but multiplies the product allowance when a workspace has several connected members.                |
| Persist exact traversal and admit centrally per workspace | Adds one internal DO RPC per changed bookmark, but gives exact shared accounting, idempotence, and bounded recovery. |

## Decision

Probe and paginate X bookmarks with `max_results=1` until any of 16 recent
durable checkpoints is reached. Process at most 25 provider requests per alarm;
persist the pagination token and discovered bookmark payloads, then resume on a
near-term alarm when the scan is incomplete. Continue exposing the newest
successful head as the legacy watermark.

Admit completed scans oldest-first through the workspace `LinkProcessorDO`.
The executable Pro default is 300 imported X bookmarks per subscription-aligned
monthly window. Admission is serialized, idempotent by tweet ID within the
window, and records the count only after Queue acceptance. Accepted prefixes
become checkpoints even if a later send fails or the allowance is exhausted.

Track a per-user provider-read safety ceiling equal to the workspace allowance
plus a small fixed recovery buffer. Count one tweet once per UTC day in the
active usage window so repeated adaptive probes of the same head do not consume
the local ceiling. On either ceiling, retain unfinished scan state and schedule
the entitlement reset. Deferred bookmarks consume the next window during
catch-up; sustained creation above the allowance may remain behind but is never
silently skipped.

## Consequences

- Normal provider work is proportional to new bookmarks plus a bounded
  checkpoint read instead of a repeated 50-item page.
- Long gaps and month rollover are slower but exact and resumable.
- The provider request count rises relative to batch paging; rate-limit handling
  and persisted traversal absorb that tradeoff.
- X usage counters remain workspace-owned without a D1 table or global
  scheduler.

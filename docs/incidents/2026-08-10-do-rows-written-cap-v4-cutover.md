# DO daily rows_written cap exceeded on the effect-v4 cutover

**Date:** 2026-08-10, ~16:20 UTC (blocked until 2026-08-11 00:00 UTC)
**Status:** RESOLVED by daily reset (no upgrade; decision below)
**Impact:** All Durable Object requests incurring SQL writes returned errors account-wide for ~7.5 h. Web app unaffected (local-first OPFS). Server-side ingest (Telegram / Raycast / public `POST /api/ingest`) at silent-loss risk for the window via the known DLQ-no-consumer gap. Chat agent and server-side sync writes erroring until reset.

## Summary

The effect-v4 + upstream-livestore cutover (PR #82, merged as `963373b`, deploy `bcd404c6`) triggered livestore's one-time **full rematerialization from the eventlog** in every server-side livestore client DO. The two rematerializations that ran during post-deploy smoke testing wrote ~101k SQLite rows inside a single hour — five months of normal write volume — and tripped the Workers **free-tier daily cap of 100,000 rows_written**, which then blocked all DO writes on the account until the midnight-UTC reset.

## Mechanism

1. Effect v4 changed `Schema.hash` output, so every materialized table's schema hash differs from the hash stamped in each store's DO SQLite (expected; recorded pre-cutover as the "schema-hash warn spam + one-time rematerialization" G4 item in [[todos/effect-v4-migration-progress]]).
2. On first boot under the new deploy, each livestore client drops and rebuilds all materialized tables by replaying the full eventlog — **4,466 events** (measured from the browser eventlog export, 2026-08-10; dense `seqNumGlobal` 1→4466; ≈8.3 events per created link across 540 creations, dominated by the processing pipeline: TagSuggested 786, MetadataFetched 604, ProcessingStarted 550, ProcessingCompleted 500, Summarized 491, LinkCreated v1+v2 540, ProcessingFailed 371, SourceNotified 344, rest &lt;300).
3. Server-side that ran twice, once per client DO on the tested workspace:
   - **LinkProcessorDO** (`0cc85e49…`): **53,351 rows** in the 16:00Z hour (first link ingest woke it).
   - **ChatAgentDO** (`7e9854e6…`, inferred — the only other DO-resident livestore client; burst matches the chat-agent smoke test): **47,915 rows** same hour.
   - SyncBackendDO stores the raw eventlog only (no materializers) — negligible writes.
   - Per-event write cost: 53,351 ÷ 4,466 ≈ **12 rows/event** (LP), 47,915 ÷ 4,466 ≈ **10.7** (Chat). The replay materializes per event (`rematerialize-from-eventlog.ts` — `CHUNK_SIZE=100` is only SELECT pagination), so each event's dbState commit flushes its dirty 8 KB VFS pages as native rows. See the VFS-verification section below.
4. Together ≈ 101k ≥ the 100k/day free cap → Cloudflare alert at ~16:20Z, writes blocked account-wide until 2026-08-11 00:00 UTC.
5. Browser clients replayed the same way but into OPFS — local, free, invisible to the cap.

Baseline for scale: 130–1,706 rows/day the prior week; 30-day total 120.3k **including** the incident (i.e. a normal month is ~19k writes).

## VFS write path verified — NO regression of livestorejs#1089

Checked same day (the upstream VFS write-reduction PR is Bohdan's; suspicion was write amplification regressing across the fork→upstream rework). Three independent lines of evidence say the optimization is intact:

1. **Architecture intact at the vendored SHA.** Eventlog on native DO SQLite, auto-committed per insert (1 event = 1 row); `dbState` on the VFS with page-aligned **8 KB single-page writes** — `CloudflareDurableObjectVFS` asserts `PRAGMA page_size` matches and rejects non-page-aligned writes; journal in memory. The #1089 design survived the upstream rework unchanged.
2. **Steady-state billing shows the cold-start win live in prod.** 2026-08-08 (quiet pre-cutover day): **130 rows written total** across ~95 hibernation wakes ≈ 1.4 rows/wake — i.e. cold boots write ~nothing, matching #1089's "cold start 4,003 → 0 writes" result. A regressed VFS would bill thousands/day from wake churn alone.
3. **The burst is replay commit granularity, not VFS overhead.** ~11–12 dirty pages per commit across a multi-table + multi-index schema is roughly the physical floor for _per-event_ transactions (leaf + interior + header per touched B-tree). Caveat: not apples-to-apples with #1089's 22-writes/todo benchmark (different schema/workload) — the claim is "consistent with the optimized VFS", not "beat the bench". Pre-#1089 (64 KB blocks + `mergePartialBlock` + journal-on-VFS) the same replay would have been ~10× worse; the first DO alone would have blown the cap.

Upstream levers if replay cost ever needs to shrink (orthogonal to #1089): wrap each 100-event replay chunk in ONE dbState transaction (hot pages amortize ~10×), or the in-memory-boot-then-flush TODO already noted in `rematerialize-from-eventlog.ts:16`.

## Not a loop — one-time cost, mostly paid

Both rematerializations **completed** (summaries and chat worked after them), so the new schema hashes are durably stamped and those two DOs will not re-pay. Hourly analytics show a single-hour spike, then baseline.

**Residual exposure:** the other active workspaces' client DOs had not yet woken under v4 — each pays its own one-time rematerialization on first wake (size ∝ that store's eventlog). A same-day cluster of those could trip the cap once more; after that, fully paid.

## What the free-tier block coupled to

- Server ingest path: queue → LinkProcessorDO write fails → ×3 retries → `cloudstash-link-dlq`, which has **no consumer** → silent link loss with a false `{queued}` ack. Documented pre-existing gap ([[todos/server-ingest-durability]]); the cap window is exactly the scenario it warned about. Mitigation during the window: don't ingest via Telegram/Raycast/API.
- Everything read-only (pulls, page loads) kept working; duration/hibernation metrics stayed healthy throughout ([[architecture/sync-backend-do-hibernation-billing]] — the v4 runtime hibernates fine; same-day verification showed ~25 s billed against ~28 connection-hours).

## Lessons

1. **Forecast writes, not just logs/duration, for any schema-hash-changing deploy.** The rematerialization was predicted (warn spam, first-boot latency) but never translated into a rows_written budget. The estimate is trivial in hindsight: `eventlog rows × ~11 rows/event × (number of server-side client DOs that will wake)` vs the 100k/day cap (rows/event ≈ dirty 8 KB pages per per-event commit; measured 10.7–12 here). For this cutover: 4,466 × ~11 × 2 ≈ 98k for the first workspace alone — i.e. the incident was computable pre-merge.
2. **The cost grows monotonically.** Eventlogs only grow, so every future materializer-schema change replays more events for more rows. Durable answers: Workers Paid (removes daily caps; today's burst = 0.2% of the paid monthly allotment), and eventually eventlog compaction/snapshotting upstream.
3. **Free-tier caps are account-wide and blocking.** One workspace's migration cost took out writes for every workspace and every worker on the account — same coupling as the June duration incident.

## Decision log

- 2026-08-10: user declined the $5 Workers Paid upgrade for now; accept the midnight reset and the residual other-org rematerialization risk.

## Watch

- Other-org first wakes under v4 (one burst each, then done) — check `durableObjectsPeriodicGroups` rows_written by namespace for a day or two.
- Post-reset: confirm queued/lost ingests — anything sent via Telegram/Raycast/API during the window is likely in the DLQ (unrecoverable until a consumer exists).
- Before the NEXT schema-changing deploy: run the lesson-1 estimate; if projected over ~50% of cap, either stage the deploy right after 00:00 UTC or upgrade first.

Related: [[todos/effect-v4-migration-progress]] (cutover), [[todos/server-ingest-durability]] (DLQ gap), [[architecture/sync-backend-do-hibernation-billing]] (June duration incident + analytics method), [[todos/ws-close-scope-teardown-exception]] (separate same-day finding).

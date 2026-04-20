# E2E testing for DO-to-DO sync

The sync bug (April 1-7) took 3 days to diagnose because no tests cover the DO-to-DO sync path in production conditions. Miniflare doesn't reproduce production behavior (no CSP enforcement, no cross-isolate RPC, no autogates).

## Critical test cases

1. **Cold boot sync** — fresh deploy → ingest 1 link → verify all processing events in SyncBackendDO within 15s
2. **Warm DO sync** — existing DO → ingest link → verify sync
3. **Concurrent ingests** — 2+ links simultaneously → all sync (catches push fiber interruption)
4. **Hibernation recovery** — ingest → wait >60s → ingest → verify sync still works
5. **Cross-client sync** — DO RPC ingest → verify visible via WebSocket pull (browser path)
6. **Serialization integrity** — push 1 event → query SyncBackendDO eventlog → confirm non-empty arrival

## Options

- **Repro app** (like `repro-do-sync/`) — minimal CF worker, fast, catches livestore-level regressions
- **Staging env** — same codebase, real flows, catches integration issues
- Probably both long-term

## Concurrent processing tests (requires livestore store)

Unit tests can't cover the DO's subscription-driven concurrency because it requires a live livestore store with reactive subscriptions. These cases need integration/e2e tests:

1. **Semaphore limits actual concurrency** — ingest 7 links → verify at most 5 process simultaneously (observe `linkProcessingStarted` event timestamps)
2. **submittedLinks dedup** — subscription fires twice with overlapping pending links → each link processed exactly once
3. **Draft reflects concurrent state** — ingest 2 telegram links → verify draft shows both → complete one → verify draft shows only the remaining link
4. **Draft restored after confirmation** — complete a link → `sendMessage` clears draft → verify draft re-sent for remaining links
5. **Boot cleanup notifies telegram** — cancel stale telegram links on boot → verify "Processing was interrupted" reply sent per chat
6. **Queue batch concurrency** — send batch of 5 messages → verify `ingestAndProcess` called concurrently (not sequentially)

See [[incidents/2026-04-link-processor-sync-bug]] for full context.

## Current status — blocked on upstream

PR [#46](https://github.com/bohdanbirdie/cloudstash/pull/46) implements 12 miniflare-based e2e tests covering cold/warm boot sync, duplicate detection, concurrent ingests, cross-org isolation, fetch trigger path, and queue batch handling via real DOs. Tests pass locally on macOS but CI on Linux hangs indefinitely.

### Root cause

`vitest-pool-workers` per-test storage isolation snapshots/pops DO SQLite state between tests. LinkProcessorDO's livestore opens SQLite in WAL mode, creating `.sqlite-shm`/`.sqlite-wal` sidecars. The pool's pop logic asserts filenames end in `.sqlite` and throws on the sidecars (`AssertionError: Expected .sqlite, got ...sqlite-shm`). After that, the livestore push fiber is left mid-push against inconsistent state and retries forever — that's the hang.

Passes on macOS because SQLite checkpoints WAL more eagerly than Linux, so sidecars usually don't exist at pop time. Environmental flake, not a test bug.

### Upgrade path blocked

- `@cloudflare/vitest-pool-workers@0.13+` removes isolated storage entirely (would fix this)
- 0.13+ requires `vitest ^4.1.0`
- `@effect/vitest` stable is pinned to `vitest ^3.2.0` — no stable release supports vitest 4 yet (only 4.0.0-beta tags)

### Plan

Leave PR #46 open. When `@effect/vitest` stable supports vitest 4, upgrade `vitest` + `@cloudflare/vitest-pool-workers` together and unblock.

Alternatives rejected: `isolatedStorage: false` loosens isolation for all e2e tests; skipping on CI defeats the purpose.

Related: [workers-sdk#11031](https://github.com/cloudflare/workers-sdk/issues/11031).

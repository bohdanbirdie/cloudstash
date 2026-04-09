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

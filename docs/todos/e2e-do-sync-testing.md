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

See [[incidents/2026-04-link-processor-sync-bug]] for full context.

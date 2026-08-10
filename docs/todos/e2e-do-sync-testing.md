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

## Status — dependency blocker cleared (2026-06-07)

PR [#46](https://github.com/bohdanbirdie/cloudstash/pull/46) implements 12 miniflare-based e2e tests covering cold/warm boot sync, duplicate detection, concurrent ingests, cross-org isolation, fetch trigger path, and queue batch handling via real DOs. Tests pass locally on macOS but CI on Linux hangs indefinitely.

### Root cause

`vitest-pool-workers` per-test storage isolation snapshots/pops DO SQLite state between tests. LinkProcessorDO's livestore opens SQLite in WAL mode, creating `.sqlite-shm`/`.sqlite-wal` sidecars. The pool's pop logic asserts filenames end in `.sqlite` and throws on the sidecars (`AssertionError: Expected .sqlite, got ...sqlite-shm`). After that, the livestore push fiber is left mid-push against inconsistent state and retries forever — that's the hang.

Passes on macOS because SQLite checkpoints WAL more eagerly than Linux, so sidecars usually don't exist at pop time. Environmental flake, not a test bug.

### Upgrade path — resolved (2026-06-07)

The dependency-side blocker is cleared. A security dep-audit moved us to **`vitest@4.1.7` + `@cloudflare/vitest-pool-workers@0.16.10`**, which removes per-test isolated storage entirely — so the WAL-sidecar `AssertionError` / push-fiber hang root cause no longer exists.

The original `@effect/vitest` blocker turned out to be **transitively gated on livestore**, not just an upstream release lag:

- The only vitest-4-capable `@effect/vitest` is the `4.0.0-beta` line, which peers **`effect ^4.0.0-beta`**.
- effect v4 is blocked because `@livestore/peer-deps` hard-pins **`effect@3.21.2`** (and `@effect/vitest@0.29.0`).
- So "wait for `@effect/vitest` stable" can't resolve until livestore itself moves to effect v4.

We bypassed this by keeping **`@effect/vitest@0.29.0`** (the effect-v3 line) and running it against vitest 4 via a **peer mismatch** — it declares `vitest ^3.2.0`; bun warns but installs; the adapter only uses core test APIs that didn't break across 3→4. Verified green: 1167 unit + 51 e2e tests pass. The combo is _officially unsupported_ (low risk within 4.1.x given what `@effect/vitest` uses; the suite is the tripwire) until livestore→effect v4 lets us adopt `@effect/vitest@4.x` cleanly.

## Resolution — PR #46 MERGED (2026-08-10, `e278fd1`)

The effect-v4 cutover ([[todos/effect-v4-migration-progress]]) cleared the last dependency: `@effect/vitest@4.0.0-beta.99` runs natively on vitest 4, retiring the 0.29.0 peer-mismatch hack. The rebase onto main was conflict-free and the April test file landed **byte-identical** — all 12 tests green on macOS and Linux CI. The WAL-sidecar hang is confirmed dead (first CI attempt ran the full suite to completion in 68s).

One new fix was required: with per-file storage isolation gone, background DO fibers (livestore push, link processing) keep logging after a file's last test, and vitest's console-intercept RPC raced environment teardown on CI (`EnvironmentTeardownError: Closing rpc while "onUserConsoleLog" was pending`). Fixed suite-wide with `disableConsoleIntercept: true` in `vitest.e2e.config.ts` — e2e output loses per-test log attribution, which is acceptable for diagnostics-only logs.

**Caveat for future e2e work:** `abortAllDurableObjects()` inside `afterAll` reproducibly deadlocks the run (verified A/B: 2/2 hangs with it, 2/2 green without; vitest buffers per-file output, so the hang looks like a silent boot stall). Mid-test aborts, as in `server-ingest-stranding.test.ts`, remain fine — just don't use it as file teardown.

### Remaining coverage (still open)

Critical cases 4–6 and the concurrent-processing list above are uncovered: hibernation recovery, cross-client sync via WebSocket pull (browser path), asserting events actually **arrive** in SyncBackendDO's eventlog (the merged tests assert ingest status, not sync arrival), and the semaphore/dedup/draft concurrency semantics. Scope future work at cloudstash app-level flows (ingest → sync → UI) — upstream livestore now carries the hibernation + reconstruction guard suites itself (#1427/#1435/#1541).

Related: [workers-sdk#11031](https://github.com/cloudflare/workers-sdk/issues/11031).

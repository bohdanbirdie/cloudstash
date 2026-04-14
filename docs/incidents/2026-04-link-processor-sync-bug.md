# LinkProcessorDO Sync Bug

**Date:** 2026-04-01 → 2026-04-07 (initial), regressed 2026-04-14
**Status:** RESOLVED (re-resolved 2026-04-14)
**Impact:** Links sent via Telegram processed successfully but never appeared in browser UI.

## Problem

LinkProcessorDO processes links (metadata, AI summary, Telegram notification) but events never sync to SyncBackendDO → browser never sees them. Browser-to-browser sync works fine. Problem is exclusively LinkProcessorDO → SyncBackendDO direction.

## Timeline

- **April 1, 07:12 UTC:** Last working Telegram link. DO was warm (alive 2+ days, no cold boot).
- **April 1, 19:02 UTC:** First broken Telegram link. DO cold-booted after eviction. Same deployed code (last deploy March 28).
- **April 2:** Deployments forced cold boots + user started saving links via browser UI → exposed the divergence.
- **April 4:** Investigation started.
- **April 5:** 11 recovery/debugging attempts. Identified RPC transport as the problem layer.
- **April 6:** Built minimal repro app (`repro-do-sync/`). Found all three root causes.
- **April 7:** All fixes deployed and verified. Three links (Telegram, UI, Telegram) synced with full processing.

**Key insight:** Same code, different runtime. The long-lived DO instance worked; the cold-booted one on a newer CF runtime did not. No code deploy between working and broken.

## Root Causes (3 separate bugs)

### Bug 1: Store creation race

No guard on `getStore()` — concurrent requests (queue handler + `onPush` fetches) each see `cachedStore === undefined` and start separate `createStoreDoPromise` calls on the same DO SQLite, corrupting the eventlog.

**Fix:** `storeCreationPromise` singleton guard (PR #30).

### Bug 2: RPC stream framing broken in production CF

CF DO RPC merges multiple `controller.enqueue()` calls into fewer `reader.read()` responses, breaking msgPack message boundaries. All messages arrive with `_tag=undefined` → Effect RPC silently drops them → mailbox never registered → `syncUpdateRpc` callbacks dropped → pull never completes.

**Fix:** Patch `@livestore/common-cf` — `decoded.flat(1)` in `do-rpc/client.js` to handle merged buffers. (The `type: "bytes"` change initially applied turned out to be unnecessary — the real fix is the client-side flattening.) Being fixed upstream in livestore via [PR #1163](https://github.com/livestorejs/livestore/pull/1163).

### Bug 3: msgpackr `useRecords` blocked by CF Workers CSP

`@effect/rpc`'s `RpcSerialization.msgPack` uses default `Unpackr()` which has `useRecords: true`. This triggers `new Function()` JIT compilation, blocked by CF Workers' V8 CSP. Error is **completely silent** — `unpackMultiple()` returns `[]` instead of decoded messages. Push RPC payloads arrive empty at SyncBackendDO.

**Fix:** Patch `@effect/rpc`'s `RpcSerialization.js` — pass `{ useRecords: false, int64AsType: 'number' }` to `Unpackr` and `{ useRecords: false }` to `Packr`.

## Clues That Led to the Fix

1. Browser sync worked fine → SyncBackendDO is healthy, problem is DO-to-DO only
2. Local miniflare worked at 10x production event count → production CF runtime specific
3. Server-side pull logging showed all events emitted correctly → client-side transport issue
4. Client received 22 of 23 chunks, always missing the last → RPC stream framing
5. Fresh account with only 16 events also broken → not size-dependent
6. Minimal repro app reproduced the bug without any cloudstash code → livestore DO-RPC transport issue
7. Transport logging showed `_tag=undefined` on all messages and only 2-3 `reader.read()` for 23 enqueues → CF merging buffers

## Theories Tried and Denied

| #   | Theory                                          | Why denied                                                                               |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | PR #26 materializer change caused it            | Doesn't affect eventlog PK conflict or sync                                              |
| 2   | Drop all DO state via migration                 | Too blunt, unclear when regression started                                               |
| 3   | MaterializeError during boot is the blocker     | Only during concurrent store creation; after race fix, no MaterializeError               |
| 4   | ServerAheadError is fatal                       | Normal rebase protocol, not an error                                                     |
| 5   | PR #25 (Defuddle) caused it                     | Content extraction unrelated to sync                                                     |
| 6   | `livePull: true` prevents hibernation           | Worked for weeks; only `Effect.never` from stuck rebase prevents hibernation             |
| 7   | Table drop + fresh boot fixes it                | Tried 3 times, same stall every time                                                     |
| 8   | setTimeout for DO lifetime limit                | Wrong mechanism for DOs                                                                  |
| 9   | resetPersistence for auto-recovery              | No clear trigger for when to reset                                                       |
| 10  | Server-side pull drops last chunk               | Server logs confirmed all events emitted                                                 |
| 11  | clientId echo filtering in pull                 | All events including own clientId were emitted                                           |
| 12  | Returning promise from `start()`                | Did not fix — stream produces chunks fine, framing is the issue                          |
| 13  | Push fiber interrupted by `FiberHandle.clear`   | Accurate analysis but was a red herring — real cause was empty payloads from CSP failure |
| 14  | Cap'n Proto multiplexing blocks concurrent RPCs | Disproven — separate stubs, `livePull: false`, and plain fetch all show same bug         |

## Recovery Attempts Summary

| #   | What                                  | Result                                                                                                   |
| --- | ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | Table drop                            | Pull climbed to 1892/1918, stalled. 3 Telegram links processed locally, none synced.                     |
| 2   | Redeploy                              | Same stall + race re-corrupted eventlog                                                                  |
| 3   | Table drop + server-side pull logging | Server emitted all events. Client got `totalRowsWritten: 281`. RPC transport confirmed as problem layer. |
| 4   | Table drop + client-side pull logging | Client received 22/23 chunks. Chunk 22 (`NoMore`) dropped.                                               |
| 5   | Production data on local miniflare    | All 23 chunks received, 1918 events materialized. Same data works locally.                               |
| 6   | Fresh account (16 events)             | Single-chunk pull also drops `NoMore`. Every cold-boot pull broken.                                      |
| 7   | Fresh account full lifecycle          | Push-only works while DO warm. Breaks when browser creates events DO hasn't pulled.                      |
| 8-9 | `start()` return fix                  | Did not help for either fresh or main account                                                            |
| 10  | Latest snapshot + compat date update  | Same failure                                                                                             |
| 11  | Transport-level logging               | Revealed `_tag=undefined`, merged buffers, no `done=true`. Critical finding.                             |
| 12  | `type: "bytes"` + `flat(1)` patches   | Fixed framing internally. End-user still broken (led to discovering Bug 3).                              |

## CF Runtime Research

- **V8 14.6** deployed March 20 (gradual rollout across CF edge)
- **workerd v1.20260403.1:** Fixed use-after-free in stream backpressure handling (`queue.h`)
- **Autogates** (`ENABLE_DRAINING_READ_ON_STANDARD_STREAMS`, `RPC_USE_EXTERNAL_PUSHER`) — not enabled in miniflare, only production. Explains local vs production difference.
- Cannot confirm which exact workerd version or autogates were active on April 1

## Current Deployed State

- Livestore snapshot `484098f5` with `compatibility_date = "2026-04-05"`
- Store creation guard (`storeCreationPromise`)
- Bug 2 (`@livestore/common-cf` `flat(1)`) — merged upstream in [livestorejs/livestore#1167](https://github.com/livestorejs/livestore/pull/1167), present in current snapshot. Patch dropped.
- Bug 3 (`@effect/rpc` msgpackr CSP) — local patch `patches/@effect%2Frpc@0.75.0.patch`. See "Regression" below.

## Regression (2026-04-14)

PR #42 ("Bump livestore snapshot and drop local patches") removed the `@effect/rpc` patch under the assumption that [livestorejs/livestore#1163](https://github.com/livestorejs/livestore/pull/1163) shipped the fix to consumers. **It did not.** Telegram link sync silently broke in production within hours.

### Why the upstream livestore patch never reached us

PR #1163 added `patches/@effect__rpc@0.75.0.patch` registered in livestore's `pnpm-workspace.yaml`. This patches `@effect/rpc` only inside livestore's own `node_modules` at install time, because:

1. **pnpm `patchedDependencies` are not published.** They are workspace-install metadata. `pnpm publish` strips them.
2. **`@effect/rpc` is a `peerDependency` of `@livestore/sync-cf`.** No `bundledDependencies`, no inlining. Each consumer installs a fresh copy from npm.
3. **Livestore's published dist resolves `RpcSerialization` at runtime.** `common-cf/dist/do-rpc/client.js:44` calls `RpcSerialization.msgPack.unsafeMake()` with `RpcSerialization` re-exported from `@livestore/utils/effect`, which resolves to the consumer's `node_modules/@effect/rpc` — unpatched.

Net effect: livestore PR #1163 fixes livestore's own CI / dev / examples. Every downstream CF Workers consumer still hits the CSP block.

### What the livestore fix should have been

Don't patch `@effect/rpc` — ship a CSP-safe `RpcSerialization` from livestore itself. Add an internal module that duplicates `@effect/rpc`'s `msgPack` body but imports `msgpackr/index-no-eval`, then route `common-cf/src/do-rpc/{client,server}.ts` (and ws-rpc equivalents) through it. Because the no-eval import lives inside livestore's own module graph, consumers get the fix automatically with no patching, no overrides, no peer-dep coordination.

### Resolution

- Reapplied `patches/@effect%2Frpc@0.75.0.patch` matching upstream PR #1163 byte-for-byte: swap `msgpackr` for `msgpackr/index-no-eval` in both `dist/cjs/RpcSerialization.js` and `dist/esm/RpcSerialization.js`. Commit `10b3055` on main.
- Patch shape changed from the original (`{ useRecords: false, int64AsType: 'number' }` constructor args) to the `index-no-eval` import swap, per IGassmann's review on #1163. Cleaner and preserves msgpackr's record/structure optimization.

### Lessons

- "Upstream merged" ≠ "consumers fixed" when the upstream is a workspace-level patch on a peer dependency. Verify by inspecting installed `node_modules` after a clean install, not by reading PR descriptions.
- The original `@effect/rpc` patch can only be dropped once a real fix lands inside `@effect/rpc` itself (tracked at [Effect-TS/effect#6161](https://github.com/Effect-TS/effect/pull/6161)).

## TODOs

- [ ] After dev server crash/restart, ~40 unprocessed links (status: processing-started) are not picked up by `pendingLinks$`. Need recovery mechanism for links stuck in "started" state after DO restart.
- [ ] Push Effect-TS/effect#6161 forward; only that lands a fix that ships to consumers.
- [ ] Send the "what the livestore fix should have been" section to the livestore team — they may want to revisit #1163 with a runtime fix instead of a workspace patch.

## Key Livestore Internals (Reference)

- DO-to-DO sync uses RPC, not WebSocket. `livePull` via callback: SyncBackendDO registers client in `rpcSubscriptions`, calls `syncUpdateRpc` on client.
- `requestIdMailboxMap` is module-level — lost on isolate restart.
- `createStoreDoPromise` assumes exclusive SQLite access.
- Push fiber is `Effect.interruptible`. `restartBackendPushing` uses `FiberHandle.clear` to interrupt it.
- CF DO SQLite rejects SQL-level transactions; adapter uses `storage.transactionSync()` instead.
- `ServerAheadError` triggers rebase: push parks on `Effect.never`, pull delivers missing events, pending events re-sequenced, push restarts.

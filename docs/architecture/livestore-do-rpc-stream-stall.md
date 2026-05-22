# LinkProcessorDO sync stall — historical postmortem

**Date:** 2026-05-16
**Affected:** `LinkProcessorDO` (LP) ↔ `SyncBackendDO` (SB) sync, all storeIds
**Root cause:** two compounding bugs in `@livestore/common-cf`'s DO-RPC streaming layer
**Status:** fixed via `bun patch`; upstream fix pending (see [Open upstream work](#open-upstream-work))

This is a historical reference, not a living investigation doc. If LinkProcessorDO stops advancing its sync head and the symptoms match, read this first — it answers "is it the old bug or something new?"

## TL;DR

LP is a livestore client to SB over Cloudflare DO-RPC. SB streams catchup events back as a `ReadableStream` of msgpack-encoded chunks. **Two independent bugs in the DO-RPC layer** caused the client to silently lose all stream data past the first ~4–8KB on every cold-boot pull. Without the catchup events, LP could not advance `__livestore_sync_status.head`, every push hit `ServerAheadError`, and the DO was permanently stuck.

The bug is deterministic, not a race. Once an LP got stuck, it stayed stuck across server restarts.

## Symptoms

You will see all of these together:

1. **Links visible in DB but not in UI**, or pasted links never finish processing.
2. **LP sqlite head < SB max** with LP eventlog containing rows past LP's head:
   ```
   LP head = N           (e.g. 370)
   LP eventlog MAX = M   (M > N, e.g. 400 — LP's own pushed events)
   SB eventlog MAX = K   (K > M sometimes, or K between N and M)
   ```
3. **Repeating log signature on every LP cold boot:**
   ```
   ServerAheadError: { minimumExpectedNum: <SB_max>, providedNum: <LP_head> }
   ```
4. Optionally `No mailbox found for 0` after store creation — symptom of the broken broadcast path downstream of the real bug.

If you see ServerAheadError firing once and then resolving (head advances on the next chunk), that's the **normal** rebase dance documented in `CLAUDE.md` under "Livestore Sync." If you see it repeating identically across cold boots, this is the bug.

## Reproduction — Recipe A (deterministic)

Fresh account, controlled state, ~30s to trigger.

### Setup

1. Sign up a fresh user, generate an API key.
2. Burst-ingest 50 fake links (needs a `LINK_PROCESSOR_USE_FAKES=1` flag and a burst endpoint, **both removed after the investigation** — re-add if you need to repro again).
3. Wait ~30s for processing to settle.
4. Verify clean baseline: LP head = LP evMax = SB max (all equal, e.g. 400).

### Find LP and SB sqlite files

```bash
# LP files (one per active storeId)
for f in .wrangler/state/v3/do/cloudstash-LinkProcessorDO/*.sqlite; do
  storeid=$(sqlite3 "$f" "SELECT name FROM __miniflare_do_name LIMIT 1;" 2>/dev/null)
  head=$(sqlite3 "$f" "SELECT head FROM __livestore_sync_status LIMIT 1;" 2>/dev/null)
  evmax=$(sqlite3 "$f" "SELECT MAX(seqNumGlobal) FROM eventlog;" 2>/dev/null)
  [ -n "$storeid" ] && printf "LP %s  storeId=%s  head=%s  evMax=%s\n" "$(basename $f)" "$storeid" "$head" "$evmax"
done

# SB files (one per storeId, table name encodes storeId)
for f in .wrangler/state/v3/do/cloudstash-SyncBackendDO/*.sqlite; do
  table=$(sqlite3 "$f" "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'eventlog_%' LIMIT 1;" 2>/dev/null)
  if [ -n "$table" ]; then
    max=$(sqlite3 "$f" "SELECT MAX(seqNum) FROM $table;" 2>/dev/null)
    printf "SB %s  table=%s  max=%s\n" "$(basename $f)" "$table" "$max"
  fi
done
```

### Trigger the stall

Stop the dev server, then:

```bash
sqlite3 <LP-sqlite-path> "UPDATE __livestore_sync_status SET head = head - 30;"
```

Restart the dev server. Paste any link in the UI to wake LP.

### Why 30

The bug fires when the catchup pull payload exceeds the first `reader.read()` chunk (~4KB on local miniflare; varies in production). A 30-event gap in our schema reliably produces an encoded payload of ~8KB, which spans 2–3 read chunks. Smaller gaps may sit under the threshold and not trigger.

### Expected (broken) behavior

- `ServerAheadError { minimumExpectedNum: <SB_max>, providedNum: <rewound_head> }` on every cold boot
- A client-side `ParseError` deep in the pull stream
- LP head never advances; stays stuck at rewound value

### Expected (fixed) behavior

- One `ServerAheadError` on the optimistic push (this is normal — LP doesn't know SB has newer events yet)
- Pull stream delivers all catchup events cleanly
- LP head jumps from rewound value to current SB max
- No `ParseError`
- Subsequent pushes succeed and broadcast back, head climbs in real-time

### Natural (non-SQL) reproduction

The same bug fires naturally when:

- LP has been hibernated long enough that SB accumulated 20+ events it never received (e.g. bot ingestion was active while LP slept), then any UI action wakes LP and triggers the cold-boot pull.
- A burst of 50+ events arrives faster than LP can push them back through SB's broadcast loop, the broadcast races, and one cold boot later LP needs to catch up via pull.

The SQL recipe is just the fast-and-deterministic version of the natural trigger.

### Teardown

Delete the LP and SB sqlite files for the storeId and re-seed, or delete the account in the UI and re-create.

## Root cause

Two independent bugs in `@livestore/common-cf`, both in `dist/do-rpc/`.

### Bug 1 — server: missing `return` in `ReadableStream.start()`

`createStreamingResponse` in `do-rpc/server.js` was firing the runtime stream as fire-and-forget:

```js
// before
runStream.pipe(
  Effect.provide(layer),
  Effect.scoped,
  Effect.tapCauseLogPretty,
  Effect.runPromise
);
```

The Cloudflare runtime needs the promise returned from `start()` to know when the stream is done producing chunks. Without `return`, CF could tear the stream down before the second-and-later `controller.enqueue` calls fired, dropping the tail of any multi-chunk payload.

```js
// after
return runStream.pipe(
  Effect.provide(layer),
  Effect.scoped,
  Effect.tapCauseLogPretty,
  Effect.runPromise
);
```

### Bug 2 — client: decode-per-chunk with no buffer alignment

`processReadableStream` in `do-rpc/client.js` was decoding each `reader.read()` chunk individually:

```js
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const decoded = parser.decode(value); // ← decodes partial msgpack frame
  for (const msg of normalize(decoded)) await writeResponse(msg);
}
```

CF DO RPC splits stream bytes arbitrarily (~4KB chunks on local miniflare). msgpack frame boundaries don't align to that. So `parser.decode(value)` often sees a truncated buffer.

**The sneaky part:** msgpackr's `useRecords: true` mode (the default in `@effect/rpc`) does not throw `incomplete` on a truncated buffer. It silently reads past the buffer end into uninitialized memory and returns a "successful but garbage" object. The garbage then fails schema validation downstream, which throws out of the `for` loop, which throws out of the `while` loop, which aborts further `reader.read()` calls forever. The rest of the stream is silently abandoned (the `Effect.ensuring(reader.cancel())` finalizer cancels it).

End result: LP sees the first ~4KB of catchup events successfully parsed, the rest dropped, the pull silently fails, head doesn't advance, every cold boot reproduces the exact same failure.

**Fix:** drain the entire stream into one buffer before decoding:

```js
const chunks = [];
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  chunks.push(value);
}
const combined = concat(chunks);
const decoded = parser.decode(combined); // ← guaranteed complete buffer
for (const msg of normalize(decoded)) await writeResponse(msg);
```

### Why both bugs were active at once

Bug 1 had been fixed upstream-in-source at some point but the published `dist` of the snapshot we depended on (`6e9abadf4`) still has the broken form. We had previously applied a patch for Bug 1 (in commit `5ec21d1`, April 2026), then lost it during a livestore version bump and didn't notice — Bug 2 was the symptom that surfaced, but Bug 1 was contributing too.

## The fix

Two patches via `bun patch`, persisted in `patches/`:

| Patch file                                                        | What it fixes                                          |
| ----------------------------------------------------------------- | ------------------------------------------------------ |
| `patches/@livestore%2Fcommon-cf@0.0.0-snapshot-6e9abadf4...patch` | Bug 1 (return runStream) + Bug 2 (drain-first decode)  |
| `patches/@effect%2Frpc@0.75.1.patch`                              | Production CSP (`msgpackr` → `msgpackr/index-no-eval`) |

The third patch (msgpackr/index-no-eval) is unrelated to the stream stall — it's a separate production-only fix for CF Workers' CSP blocking `new Function()`. Kept here because it was also lost in the same livestore bump and bears the same maintenance burden.

`patchedDependencies` is wired in `package.json`. Run `bun install` to verify they apply cleanly.

## Verification

The fix was verified against two independent stuck states:

1. **Recipe A** (synthetic): fresh account, 50 fake links, SQL-rewind head by 30. Healed on first paste, head advanced 370 → 400.
2. **Bohdan's natural stuck store** (`NpIIlgcNci2NFRCuc6icHUOvPdeAHHEC`): production-like state with 292 events past head and 176 SB events LP hadn't seen acknowledged. Healed on first paste, head advanced 3288 → 3625, all pending events caught up and the 45 new events from continued processing landed cleanly.

In both cases:

- Server emitted a multi-chunk payload (`totalChunks: 2`) — the exact pattern that previously broke
- Client drained all chunks before decoding — the fix in action
- Zero `ParseError`, zero unrecoverable `ServerAheadError`

### Scenarios not yet exhaustively verified

If you want stronger regression coverage, these are worth running. None were tested end-to-end before the instrumentation came down:

- Cold boot with healthy state (LP head already matches SB max) — should be a no-op, no errors.
- Mid-process dev-server restart while LP is busy processing — should not stall.
- Large burst (500+ events) followed by mid-process kill of the dev server, then restart — verifies the catchup pull holds for large multi-chunk payloads.
- Two separate stuck storeIds simultaneously triggered by paste — ensures the parser instance isn't shared across storeIds in a way that could cause cross-contamination.

## Adjacent upstream issues — rule these out first

If a future stall has symptoms that look "similar but not quite" the drain bug, check whether it's actually one of these instead. All four are open or dormant against `livestorejs/livestore`:

- **#714** — CF DO 30s CPU eviction closes the sync WebSocket mid-pagination. Closest match to the symptoms here; worth a look if the stall correlates with long-running operations.
- **#955** — pending events stuck after leader handoff (different processor, analogous shape).
- **#641** — rebased pending events reference deleted parent events.
- **#961** — WebSocket not terminated when the store unmounts; can leave broadcasts in flight that never land.

There is **zero upstream test coverage** for the specific shape of "DO-as-livestore-client + cold-boot with pending events" — which is exactly LP's pattern. Any of the above could mask in the same symptom region.

## What didn't work — dead ends to skip

If you find yourself debugging a sync stall, **don't re-investigate these**:

### Heal-by-recreate (shutdown + null + recreate Store)

Calling `cachedStore.shutdownPromise()` + nulling references + `createStoreDoPromise()` again does **not** advance the head. The new store cold-boots into the same broken pull, fails the same way. Confirmed across multiple stuck states.

### Heal-by-delete (DELETE eventlog past head + recreate)

`DELETE FROM eventlog WHERE seqNumGlobal > head` + recreate **does** advance the head (Eventlog.updateBackendHead runs before materialize, so the head jump survives a materialize failure). But materializer then fails with `UNIQUE constraint: tag_suggestions.id` because the materialized tables still have rows from the deleted events. This is **not** the same code path as natural recovery — production stuck state has the eventlog intact, and the deletion changes the rebase semantics. Useful as a forensic probe, not as a heal strategy.

### Upgrading livestore

Bumping snapshot `40be66583` → `6e9abadf4` (130 commits) changed zero lines in the relevant `do-rpc/` paths. Confirmed via inspection of `latest` and `0.4.0-dev.26` — **both still have both bugs**. A livestore version bump alone will not fix this.

### Upgrading msgpackr / removing `@effect/rpc` patch

msgpackr 1.11.10 added a try/catch around `new Function()`, and `@effect/rpc@0.75.1` picked it up. This fixes the **production CSP** issue (a separate problem). It does **nothing** for Bug 2 — the truncated-buffer-returns-garbage behavior is intentional in `useRecords: true` mode and not considered a bug by msgpackr (the assumption is "feed complete buffers").

Removing the `@effect/rpc` patch is safe in **local dev** (miniflare doesn't enforce CSP) but unsafe in **production** (CF Workers does enforce CSP; without the patch, all RPC payloads come back empty).

### Refactoring LP away from livestore

LP being a livestore client is correct. The bug is in the library, not the consumer.

### Hypotheses that were investigated and rejected

- **NoSuchElementException from missing backendId on cold boot** — `backendIdHelper` is populated from eventlog's `syncMetadataJson` column on boot. Cold-boot pull always has `backendId = Some`.
- **BackendIdMismatchError silently swallowed by `onSyncError: 'ignore'`** — confirmed via instrumentation that backendIds match on both sides. SB returns the right number of events from `storage.getEvents`.
- **msgpackr records cross-contamination across RPC responses** — disabling `useRecords` produced _different_ corruption patterns. The shared record dictionary is not the issue; the truncated-decode is.
- **Wire transport drops bytes past 8KB** — initial byte-level dumps suggested only 8192 bytes arrived. Once we added a drain-first diagnostic, all 18297 bytes were confirmed to arrive. The client's read loop was aborting before draining the rest.

### Three downstream sync-cf bugs that turned out to be red herrings

These are real but not load-bearing for the stall:

- **A** — `do-rpc-client.ts` mailbox lookup miss drops broadcast events silently
- **B** — `do-rpc-server.ts` `rpcSubscriptions` keyed by storeId only, last-writer-wins on resubscribe
- **C** — `push.ts` broadcast wrapped in `Effect.fork` + `Effect.exit`, transient `clientDo.syncUpdateRpc` failures lose the broadcast permanently
- **D** — `push.ts` throws ServerAheadError before broadcast block, so server never sends catchup events on push rejection. Single-client storeIds (LP-only ingestion) had no other client to trigger the catchup broadcast.

All four are downstream of the transport bugs. The "broadcast paths drop events" symptoms never fired because the upstream pull stream was failing first. Fixing the transport bugs made these moot in practice, but they remain real bugs worth fixing upstream if anyone touches sync-cf.

## Upstream backstory — why the fix isn't merged

In April 2026, an AI-generated PR ([livestorejs/livestore#1170](https://github.com/livestorejs/livestore/pull/1170), `acusti:codex`) proposed fixing both bugs (using `unpackMultiple()` for the stream framing instead of drain-first; functionally equivalent for our case).

The maintainer (IGassmann) requested splitting it into two PRs:

> The stream framing fix stands on its own regardless, so that one can move forward independently.

The PR was eventually closed when the msgpackr 1.11.10 upstream fix landed for Bug A (CSP). On closing, IGassmann explicitly invited a follow-up PR for the stream framing fix:

> if the stream framing fix (buffering partial MessagePack payloads across `ReadableStream` reads) is still relevant, feel free to open a separate PR for that.

acusti never re-submitted. So as of the date of this doc, **Bug 2 is acknowledged upstream but has no open PR or tracking issue**. We have an explicit invitation to upstream it.

## Open upstream work

- **File a PR for the drain-first fix** against `@livestore/common-cf`. Reference [PR #1170](https://github.com/livestorejs/livestore/pull/1170) and IGassmann's invitation. Cite this postmortem as evidence of severity.
- **File a separate PR for the missing `return runStream.pipe(...)`** in `createStreamingResponse`. Smaller, more obviously correct, easier to merge.
- **(Optional)** raise an issue against `msgpackr` for the silent garbage-decode on truncated buffers in `useRecords: true` mode. They may consider this WAI ("you must feed complete buffers"), but the consumer-facing surprise is significant enough to warrant a documentation note at minimum.

## Maintenance notes

### When bumping livestore

The bugs are present in every published livestore version we have checked. After any `bun update @livestore/*` or version bump:

1. Check that both patches still apply: `bun install` should print no patch errors.
2. If the patch fails to apply (paths or context changed), regenerate it: `bun patch @livestore/common-cf@<new-version>`, re-apply the drain-first and return-runStream edits, `bun patch --commit`.
3. Verify by running Recipe A end-to-end. If LP heals on first paste, the patches are still load-bearing.

### Production safety net (still in place)

One tripwire was kept after the investigation:

- **Stuck-LP gap detector** in `SyncBackendDO.onPush` — on every push, compares the client's first `parentSeqNum` against SB's eventlog max. If the gap exceeds `STUCK_GAP_THRESHOLD` (100), logs a warning. Log only — no automatic remediation yet.

The previous shutdown-and-recreate heal action was removed because it does not fix the bug it was designed to fix (see [Heal-by-recreate](#heal-by-recreate-shutdown--null--recreate-store) under "What didn't work"). The follow-up to wire this tripwire into a real alert + remediation lives in [[../todos/admin-server-ahead-alert]].

### Investigation scaffolding removed

These were temporary and have been removed post-fix:

- `LINK_PROCESSOR_USE_FAKES` env flag
- `POST /api/ingest/burst` endpoint (burst-load testing)
- `POST /api/admin/heal-lp` endpoint (manual heal trigger)
- `scripts/bulk-feed.ts` (concurrent burst client)
- Three fake services (`*.fake.ts`) for skipping real metadata/AI calls
- `[CS-DEBUG]` `Effect.logInfo` instrumentation across `local/livestore/.../do-rpc/` and `sync-cf/.../client/transport/`
- Vite aliases redirecting `@livestore/sync-cf`, `@livestore/common-cf`, `@livestore/adapter-cloudflare` to local source

If you need to repro again, re-add the burst endpoint + fake services pattern. The full diff is recoverable from the git history around 2026-05-16.

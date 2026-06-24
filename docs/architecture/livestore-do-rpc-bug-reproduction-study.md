# LiveStore DO-RPC stream stall — reproduction study & isolation

**Date:** 2026-06-01
**Author:** Cloudstash investigation (downstream consumer of `@livestore/*`)
**Audience:** Anyone working on `@livestore/common-cf` / `@livestore/sync-cf`, especially an agent preparing upstream fixes/tests in the `livestorejs/livestore` repo.
**Companion docs:** [[livestore-do-rpc-stream-stall]] (the original postmortem), [[../incidents/2026-04-link-processor-sync-bug]] (earlier related incident).

> **One-paragraph summary.** Cloudstash runs a Durable Object (`LinkProcessorDO`, "LP") as a LiveStore client that syncs to a `SyncBackendDO` ("SB") over the **DO-RPC transport**. Two independent bugs in `@livestore/common-cf`'s `do-rpc/` layer can each truncate a multi-chunk cold-boot catchup pull, leaving the LP's sync head permanently stuck. We ran a complete 2×2 factorial against the **real running app** (not just synthetic tests) and isolated which bug is responsible for the locally-observable stall. **Result: the client-side decode bug (Bug 2) is the sole determinant of the local stall; the server-side `return` bug (Bug 1) has no observable effect under local miniflare/workerd and is deployed-CF-only.** This document records exactly what was tested, how, and what was confirmed vs. denied — including a critical methodological gotcha (vite `optimizeDeps` shadowing `node_modules`) that produced several false negatives before it was found.

---

## 1. The two bugs (precise definitions)

Both live in `@livestore/common-cf`, package snapshot `0.0.0-snapshot-6e9abadf4bdc91a2f7deea3e47be8ffd75d4c27c`.

### Bug 1 — server: missing `return` in `createStreamingResponse`

File: `src/do-rpc/server.ts` (compiled `dist/do-rpc/server.js`). The Effect stream runner is fired **fire-and-forget** inside `ReadableStream.start()`:

```ts
// BUGGY
runStream.pipe(
  Effect.provide(layer),
  Effect.scoped,
  Effect.tapCauseLogPretty,
  Effect.runPromise
);
// FIXED (PR #1264)
return runStream.pipe(
  Effect.provide(layer),
  Effect.scoped,
  Effect.tapCauseLogPretty,
  Effect.runPromise
);
```

The Web Streams contract lets `start()` return a promise; Cloudflare's runtime relies on it to know when the stream is done producing chunks. Without `return`, **deployed CF** can tear the stream down before the 2nd+ `controller.enqueue()` calls fire, dropping the tail of any multi-chunk payload. Upstream PR: **livestorejs/livestore#1264**.

### Bug 2 — client: decode-per-chunk on unaligned buffers

File: `src/do-rpc/client.ts` → `processReadableStream` (compiled `dist/do-rpc/client.js`). The buggy form decodes **each `reader.read()` chunk individually**:

```ts
// BUGGY (decode-per-chunk)
while (true) {
  const { done, value } =
    yield * Effect.tryPromise(() => reader.read()).pipe(Effect.orDie);
  if (done) break;
  const decoded = parser.decode(value); // <- partial msgpack frame
  const messages = Array.isArray(decoded) ? decoded.flat(1) : [decoded];
  for (const m of messages) yield * writeResponse(m);
}
```

```ts
// FIXED (drain-first): collect all chunks, decode once
const chunks = [];
let total = 0;
while (true) {
  const { done, value } =
    yield * Effect.tryPromise(() => reader.read()).pipe(Effect.orDie);
  if (done) break;
  chunks.push(value);
  total += value.byteLength;
}
const combined = new Uint8Array(total);
let off = 0;
for (const c of chunks) {
  combined.set(c, off);
  off += c.byteLength;
}
const decoded = parser.decode(combined); // <- guaranteed complete buffer
const messages = Array.isArray(decoded) ? decoded.flat(1) : [decoded]; // .flat(1) is #1167
for (const m of messages) yield * writeResponse(m);
```

CF DO-RPC splits the byte stream arbitrarily (~4 KB chunks). msgpack frame boundaries don't align. With msgpackr's `useRecords: true` (the `@effect/rpc` default) **in the real workerd transport**, a truncated buffer does **not** reliably throw `incomplete`; the decode fails silently (returns garbage / aborts), schema validation throws out of the read loop, the rest of the stream is abandoned, and the catchup pull never completes. There is no open upstream PR for this yet (the maintainer invited one when #1170 was closed; the `.flat(1)` part is the already-merged #1167).

> The `@effect/rpc@0.75.1` patch Cloudstash ships only swaps `msgpackr` → `msgpackr/index-no-eval` (CF Workers CSP, livestore #1163 / Effect-TS/effect#6161 / kriszyp/msgpackr#179). It does **not** touch the decode loop and is **unrelated** to Bug 2.

---

## 2. Environment under test

| Component                        | Version / value                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `@livestore/*` snapshot          | `6e9abadf4bdc91a2f7deea3e47be8ffd75d4c27c`                                                               |
| `@effect/rpc`                    | `0.75.1` (patched: `msgpackr` → `msgpackr/index-no-eval`)                                                |
| `msgpackr` (under `@effect/rpc`) | `1.11.12` (also tested `1.11.9`)                                                                         |
| Decoder                          | `RpcSerialization.makeMsgPack({ useRecords: true }).unsafeMake()` — **stateful** (`incomplete` recovery) |
| Dev runtime                      | Vite + `@cloudflare/vite-plugin` → miniflare → **workerd**                                               |
| Compat date (dev)                | `2026-04-14` (≥ `2025-06-01`, so `allow_eval_during_startup` is on)                                      |
| Topology                         | `LinkProcessorDO` (single-client LiveStore client, `livePull: true`) ↔ `SyncBackendDO`, over DO-RPC      |

**Key transport detail.** The LP is a _single-client_ store: the only writer of its events is the LP itself, except during catchup. When the LP cold-boots behind SB, it pushes its pending events, SB rejects with `ServerAheadError`, and SB streams the missing events back via the catchup pull — that pull is `createStreamingResponse` (server, Bug 1) decoded by `processReadableStream` (client, Bug 2).

---

## 3. What we tested, in order

### Phase 1 — Synthetic decoder probe (workerd via `@cloudflare/vitest-pool-workers`)

**Goal:** does decode-per-chunk (Bug 2) lose data on truncated frames?

**Method:** replicated `@effect/rpc`'s exact stateful `unsafeMake()` decoder, fed it a records-heavy wire (concat of `parser.encode([msg])` per message) split into chunks via a hand-built `ReadableStream`, using **`.slice()` copies** (independent backing buffers, like real network reads — `.subarray()` would alias the full buffer and falsely pass). Ran the **unpatched** decode-per-chunk loop.

**Matrix:** msgpackr `1.11.12` and `1.11.9`; `index-no-eval` and optimized builds; chunk sizes 7 / 64 / 4096 / 8192; 200 messages (~20 KB wire).

**Result: 16/16 PASS — every combination self-heals.** msgpackr throws `error.incomplete`, the stateful decoder stashes the tail and prepends it to the next chunk, all messages decode.

**Initial (wrong) conclusion:** "Bug 2 doesn't reproduce; the client drain patch may be redundant."

> ⚠️ **This conclusion was later DENIED by the real-app test (Phase 3).** The synthetic harness is **not faithful** to the real DO-RPC transport: feeding `.slice()` copies makes msgpackr throw `incomplete` cleanly, so the stateful recovery always works. In the genuine cross-DO-RPC byte delivery under workerd, the truncated decode fails _silently_ and the recovery does **not** engage. **Lesson for livestore: a synthetic `ReadableStream` chunking test will NOT reproduce Bug 2. You must use the real DO-RPC transport** (e.g. the wrangler-based `rpc.test.ts` harness, not a unit test over a fabricated stream).

### Phase 2 — Bug 1 synthetic models (workerd)

**Goal:** does fire-and-forget `start()` (Bug 1) drop the stream tail in local workerd?

**Method:** four escalating models, each toggling whether `start()` returns the producer promise, with an async gap (`scheduler.wait`) between `controller.enqueue()` calls:

1. same-isolate `fetch()` returning the stream;
2. a Durable Object returning the stream as an HTTP response body;
3. a Durable Object returning a `ReadableStream` **as a DO-RPC return value** (closest to do-rpc's actual shape);
4. model 3 + a 300 ms delay before the consumer starts reading (to widen any teardown window).

**Result: all four delivered every chunk even when fire-and-forget.** Local workerd keeps the orphaned producer alive as long as the consumer eventually reads it.

**Conclusion (later CONFIRMED by Phase 3):** **Bug 1 does not reproduce under local miniflare/workerd.** It depends on production-CF stream teardown (autogates miniflare doesn't emulate), matching the 2026-04 incident where the bug was production-only.

### Phase 3 — Real-app factorial (the decisive test)

This is the authoritative result. Everything above is context.

#### 3.1 Reproduction harness

- **Fresh org**, empty inbox, an API key.
- **Fake processing layers** swapped into `LinkProcessorDO`'s layer stack (`MetadataFetcher`, `ContentExtractor`, `AiSummaryGenerator` → canned fakes) so a 400-link burst is fast, deterministic, network-free, and free of model cost. (Cloudstash-specific; not relevant to the bug, only to making the burst cheap.)
- **Burst ingestion:** `POST /api/ingest` with `Authorization: Bearer <apiKey>` and body `{"url":"..."}`. This enqueues a `LinkQueueMessage` → the queue consumer drives the LP through the **real** ingest+process path → the LP commits ~8 events per link and pushes them to SB. 400 links ≈ 3200 events.
- **Forcing a catchup (the trigger).** With the dev server **stopped**, rewind the LP's persisted head so it is behind SB:
  ```bash
  sqlite3 <LP.sqlite> "UPDATE __livestore_sync_status SET head = head - 1000;"
  ```
  On restart + wake (one more `/api/ingest`), the LP boots behind SB → pushes pending → `ServerAheadError` → **catchup pull** of the 1000-event (~150 KB, many-chunk) gap. This is where both bugs live.
- **Observation:** poll the sqlite directly (see §6 for paths/queries): compare `LP __livestore_sync_status.head` against `SB MAX(seqNum)`. **Heal** = LP head climbs to SB. **Stall** = LP head frozen while `LP eventlog MAX(seqNumGlobal)` keeps climbing locally.

#### 3.2 THE CRITICAL GOTCHA — vite `optimizeDeps` shadows `node_modules`

Editing `node_modules/.bun/.../@livestore/common-cf/dist/do-rpc/server.js` (or `client.js`) **had no effect on the running server.** The Vite dev server serves **pre-bundled optimized deps** from `node_modules/.vite/deps_cloudstash/`, where `common-cf` is **inlined into** the sync-cf bundle. The running code is:

- **Bug 1 (server):** `node_modules/.vite/deps_cloudstash/@livestore_sync-cf_cf-worker.js` → `createStreamingResponse`
- **Bug 2 (client):** `node_modules/.vite/deps_cloudstash/client-<hash>.js` → `processReadableStream`

The smoking gun was the stack traces in the server logs pointing at `.vite/deps_cloudstash/...?v=<hash>`, not at `node_modules/.bun`. **To toggle a bug, you must edit the `.vite` bundle directly** (and/or clear `.vite` and let it re-optimize from edited `node_modules`). Vite occasionally re-optimizes on restart, renaming the bundle files (hash changes) — so **grep for the function, never a fixed line number.** Several early "self-heal" runs were false negatives caused by this shadowing.

#### 3.3 The 2×2 factorial (1000-event / ~150 KB catchup, real DO-RPC transport)

Each cell: set the two bundle states, rewind LP head −1000, restart dev server, wake LP, monitor.

| #            | Bug 1 (`server.ts` `return`) | Bug 2 (`client.ts` drain) | Only var changed vs. prev | LP head behaviour         | Verdict   |
| ------------ | :--------------------------: | :-----------------------: | ------------------------- | ------------------------- | --------- |
| control      |      ✅ present (fixed)      |    ✅ present (fixed)     | —                         | climbs to SB              | **clean** |
| A (wake/2,3) |          ❌ removed          |        ✅ present         | Bug 1 off                 | climbs to SB              | **HEAL**  |
| B (wake/4)   |          ❌ removed          |        ❌ removed         | Bug 2 off                 | **frozen**                | **STALL** |
| C (wake/5)   |          ✅ present          |        ❌ removed         | Bug 1 on                  | **frozen**                | **STALL** |
| heal         |          ✅ present          |        ✅ present         | both on                   | recovers from stuck state | **clean** |

**Reading the factorial:**

- **Bug 2 present → HEAL; Bug 2 absent → STALL** — in _both_ Bug 1 states. (A heals, control heals; B stalls, C stalls.)
- **Bug 1 has zero effect on the outcome** locally: A (Bug 1 off) heals exactly like control; B (Bug 1 off) stalls exactly like C (Bug 1 on).
- After restoring both fixes, the **stuck store healed** (head 2232 → 3256), proving the fix recovers, not just prevents.

#### 3.4 Log signatures (from the real runs)

- **Push rejected (always, when LP behind):**
  `ServerAheadError: { "minimumExpectedNum": <SBmax>, "providedNum": <LPhead> }`
  plus SB tripwire: `LP push lags SB eventlog — possible stuck client { sbMax, lpParent, gap }`.
- **HEAL path (Bug 2 present):** `DoClient handled backend-push-error (waiting for interupt caused by pull)` → catchup pull delivered → head advances.
- **STALL path (Bug 2 absent):** same `ServerAheadError`, **but no recovery** — head frozen, local `eventlog` MAX keeps climbing (new links process and commit locally), and **no explicit error is logged**. The decode failure is _completely silent_ — matching the original postmortem's description of Bug 2.

---

## 4. Confirmed vs. Denied

| Statement                                                                             | Status                                | Evidence                                                                                                                |
| ------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Bug 2 (client decode-per-chunk) causes the local stall                                | **CONFIRMED**                         | Factorial B & C stall; A & control heal — Bug 2 is the only variable that flips the outcome                             |
| Bug 2's fix (drain-first) is necessary and sufficient locally                         | **CONFIRMED**                         | Present ⇒ heal in both Bug-1 states; absent ⇒ stall in both                                                             |
| Bug 1 (server `return`) affects the local repro                                       | **DENIED**                            | Factorial A vs control (heal regardless), B vs C (stall regardless) — Bug 1 toggling changes nothing                    |
| Bug 1 reproduces under local miniflare/workerd at all                                 | **DENIED**                            | 4 synthetic models + factorial cell C (Bug 1 fixed, Bug 2 broken still stalls; Bug 1 broken, Bug 2 fixed heals)         |
| Bug 1 is real (deployed-CF only)                                                      | **Plausible, not locally verifiable** | Web Streams contract + the production dist patch that unstuck the real outage; cannot be exercised in miniflare         |
| Bug 2 self-heals because of the stateful `incomplete` decoder                         | **DENIED for the real transport**     | Synthetic probe self-healed (Phase 1) but the real DO-RPC transport stalls (Phase 3); recovery does not engage there    |
| msgpackr version (1.11.9 vs 1.11.12) or build (eval vs no-eval) is the differentiator | **DENIED**                            | All 4 synthetic combinations self-heal; the real-vs-synthetic transport is the differentiator, not the msgpackr variant |
| A synthetic `ReadableStream` chunking unit test reproduces Bug 2                      | **DENIED**                            | Phase 1 passed 16/16; must use real DO-RPC transport                                                                    |

---

## 5. Implications for the upstream PRs

1. **Bug 2 (client drain-first) is the one with a real, reproducible regression test.** The reproduction is the real DO-RPC catchup, not a fabricated stream. In the livestore repo, the right home is the wrangler-based `packages/@livestore/common-cf/src/do-rpc/rpc.test.ts` harness — note it already contains a **`.skip`-ped** `'should handle streaming RPC bug scenario'` test, which is the natural place to land coverage. A test must drive a **multi-chunk** streaming RPC over the **real DO-RPC** boundary (payload > one `reader.read()`), and assert all messages arrive / the client head advances. A unit test over a hand-built `ReadableStream` will pass with or without the fix (see §3, Phase 1).

2. **Bug 1 (PR #1264, server `return`) is correct but not locally reproducible.** Do not claim CI/miniflare coverage. The currently-running streaming tests in `rpc.test.ts` use **single-chunk** payloads (`Stream.take(4)` → tiny ints) that fit one `reader.read()`, so they pass with or without the `return`; the bug-scenario test is skipped. Its justification is the Web Streams underlying-source contract + the production dist patch that demonstrably unstuck the outage — not a green test.

3. **Scope note.** Bug 1 and Bug 2 are independent and compose: the drain-first client fix protects against truncation regardless of how the bytes were chunked; the server `return` ensures the bytes are fully produced in the first place. Both are worth landing; only Bug 2 is testable in miniflare today.

---

## 6. How to reproduce (recipe for a livestore agent)

This recipe is what produced the factorial. It assumes a downstream app with a DO acting as a LiveStore client (Cloudstash here), but the _mechanism_ is upstream and portable to a wrangler test in the livestore repo.

**A. Build a multi-chunk catchup gap.**

1. Generate enough events that a catchup spans several `reader.read()` chunks (we used ~1000 events ≈ 150 KB; anything well over ~4 KB works).
2. Stop the runtime. Rewind the client's persisted head so it is behind the backend:
   `UPDATE __livestore_sync_status SET head = head - 1000;`

**B. Toggle the bug in the _actually-loaded_ code.**

- Under Vite dev: edit `node_modules/.vite/deps_cloudstash/*.js` (NOT `node_modules/.bun/...` — it's shadowed). Grep for `createStreamingResponse` / `processReadableStream`.
- Under the livestore repo's own wrangler test harness: edit `src/do-rpc/{server,client}.ts` directly (no vite shadowing).
- Bug 1: add/remove `return` before the `runStream.pipe(... runPromise)` in `start()`.
- Bug 2: swap the drain-first loop ↔ decode-per-chunk loop (see §1).

**C. Restart, wake the client, observe.**

- Trigger one event so the client cold-boots and pulls the catchup.
- Watch `client head` vs `backend max`. Heal = head climbs. Stall = head frozen while the client's local eventlog max keeps climbing.

**Diagnostics (Cloudstash sqlite layout, for reference):**

```bash
# LP (client) — find by storeId / head
for f in .wrangler/state/v3/do/cloudstash-LinkProcessorDO/*.sqlite; do
  sid=$(sqlite3 "$f" "SELECT name FROM __miniflare_do_name LIMIT 1;" 2>/dev/null)
  head=$(sqlite3 "$f" "SELECT head FROM __livestore_sync_status LIMIT 1;" 2>/dev/null)
  evmax=$(sqlite3 "$f" "SELECT MAX(seqNumGlobal) FROM eventlog;" 2>/dev/null)
  [ -n "$sid" ] && echo "$f storeId=$sid head=$head evMax=$evmax"
done
# SB (backend) — table name encodes storeId: eventlog_<n>_<storeId>
sqlite3 <SB.sqlite> "SELECT MAX(seqNum) FROM eventlog_7_<storeId>;"
```

**Expected results (what we observed):** Bug 2 absent ⇒ stall (head frozen, silent). Bug 2 present ⇒ heal, regardless of Bug 1. Bug 1 alone (Bug 2 present) ⇒ heal. This is the factorial in §3.3.

---

## 7. Caveats & open questions

- **Bug 1 verification is indirect.** We could not exercise it in miniflare; deployed-CF behaviour is inferred from the Web Streams contract and the production patch. A deployed-CF test (two DOs, multi-chunk catchup, `return` removed) would close this, but Cloudstash policy forbids remote/deploy testing.
- **Why the synthetic decoder probe disagrees with reality** is not fully root-caused. Hypothesis: real cross-DO-RPC delivery hands msgpackr buffers (timing/backing) that make a truncated `unpackMultiple` fail _silently_ (no `error.incomplete`), defeating the stateful recovery — exactly the "reads past the buffer / returns garbage" behaviour the original postmortem described. The synthetic `.slice()` path always throws `incomplete` cleanly and recovers. Worth confirming inside workerd with instrumentation if you want certainty.
- **msgpackr "garbage on truncated buffer in `useRecords: true`" is considered WAI upstream** ("feed complete buffers"). So the drain-first client fix is the durable fix; do not expect a msgpackr change to remove the need for it.
- The `.flat(1)` normalization (merged-enqueue handling) is **#1167, already merged** — preserve it inside whichever decode form you ship.

---

## 8. Appendix — bundle edit cheatsheet (Vite dev)

```text
# Bug 1 toggle — node_modules/.vite/deps_cloudstash/@livestore_sync-cf_cf-worker.js
#   FIXED : return new ReadableStream({ start(controller) { return gen(function* () { ...
#   BUGGY :                                                      gen(function* () { ...   (drop `return`)

# Bug 2 toggle — node_modules/.vite/deps_cloudstash/client-<hash>.js  (processReadableStream)
#   FIXED : collect `const chunks = []` ... `const combined = new Uint8Array(total)` ... decode once
#   BUGGY : `while(true){ ... const decoded = parser.decode(value); ... }`  (decode each chunk)

# Always restore by re-adding the drain / `return`, then a restart re-bundles from node_modules.
# `bun install` reapplies the committed patches and restores a pristine tree.
```

Patches Cloudstash ships (public repo `bohdanbirdie/link-bucket`, `patches/`):

- `@livestore%2Fcommon-cf@...6e9abadf4....patch` — Bug 1 (`return runStream`) + Bug 2 (drain-first).
- `@effect%2Frpc@0.75.1.patch` — CSP only (`msgpackr` → `msgpackr/index-no-eval`); unrelated to Bug 2.

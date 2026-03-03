# LinkProcessorDO — Refactor

## Overview

LinkProcessorDO processes newly saved links: fetches metadata, extracts content, generates AI summaries, and suggests tags. It runs as a Durable Object hosting an in-memory livestore client (wasm SQLite, full replay on cold start) to participate in event-sourcing sync.

**Status:** Fully refactored (all 9 groups complete). Effect Layer services with per-step timeouts/retries, dual-path ingestion (browser direct + queue for external), event-driven Telegram notifications, stale link cleanup, and AI error propagation. 275 unit tests passing.

For historical investigation, VFS forensics, options analysis, and patch instructions, see [link-processor-refactor-history.md](./link-processor-refactor-history.md).

## Architecture

```
PATH 1: BROWSER (direct)               PATH 2: EXTERNAL (queue)
─────────────────────────               ────────────────────────

┌──────────┐  ┌───────────────┐         ┌──────────┐  ┌──────────┐
│ Browser  │  │ Reprocess     │         │ Telegram │  │ API/     │
│ (sync)   │  │ button        │         │ webhook  │  │ Raycast  │
└────┬─────┘  └──────┬────────┘         └────┬─────┘  └────┬─────┘
     │               │                       │             │
     │ commit        │ commit                │             │
     │ linkCreated   │ linkProcessingStarted │             │
     │               │                       ▼             ▼
     ▼               ▼                  ┌─────────────────────────┐
SyncBackendDO                           │   Cloudflare Queue      │
     │                                  │   { url, orgId,         │
     │ onPush                           │     source, sourceMeta }│
     │ (detects new link)               │   exp. backoff · DLQ    │
     │                                  └───────────┬─────────────┘
     │ fire-and-forget                              │
     │ (wake up DO)                                 │ Queue Consumer
     │                                              │ (wakes up DO)
     │                                              │
     ▼                                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  LinkProcessorDO (per org)                       │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ LiveStore Client (in-memory wasm SQLite)                │     │
│  │  livePull ──→ full replay on cold start (5s timeout)   │     │
│  │  store.commit() ──→ SyncBackendDO ──→ clients           │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                  │
│  Queue path only: dedup + commit linkCreated (with source)      │
│                                                                  │
│  Effect Layer pipeline (both paths):                             │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ MetadataFetcher.Live   (10s timeout, 2x retry)         │     │
│  │ ContentExtractor.Live  (15s timeout, 2x retry)         │     │
│  │ AiSummaryGenerator.Live(30s timeout, no retry)          │     │
│  │ LinkEventStore.Live    (in-memory commits)              │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                  │
│  processingStatus$ → notifySource() → Telegram 👍/👎            │
└─────────────────────────────────────────────────────────────────┘
```

## Effect Layer Services

```
processLink: Effect<void, never, MetadataFetcher | ContentExtractor | AiSummaryGenerator | LinkStore>
                                       │                  │                    │              │
                    ┌──────────────────┘                  │                    │              │
                    │           ┌─────────────────────────┘                    │              │
                    │           │           ┌──────────────────────────────────┘              │
                    │           │           │           ┌─────────────────────────────────────┘
                    ▼           ▼           ▼           ▼
               ┌─────────┐ ┌────────┐ ┌─────────┐ ┌─────────┐
               │ .Live   │ │ .Live  │ │ .Live   │ │ .Live   │  ← production (DO provides)
               │ fetch() │ │fetch() │ │env.AI   │ │ store   │
               │ +10s TO │ │+15s TO │ │+30s TO  │ │.commit()│
               │ +2 retry│ │+2 retry│ │no retry │ │.query() │
               └─────────┘ └────────┘ └─────────┘ └─────────┘
               ┌─────────┐ ┌────────┐ ┌─────────┐ ┌─────────┐
               │ .Test   │ │ .Test  │ │ .Test   │ │ .Test   │  ← unit tests (vitest provides)
               │ returns │ │returns │ │ returns │ │ records │
               │ fixture │ │fixture │ │ fixture │ │ commits │
               └─────────┘ └────────┘ └─────────┘ └─────────┘
```

**Seven services** (4 processLink-level + 3 DO orchestration-level):

| Service              | Wraps                             | Timeout                | Retry                                    | Live                                  | Test                                                |
| -------------------- | --------------------------------- | ---------------------- | ---------------------------------------- | ------------------------------------- | --------------------------------------------------- |
| `MetadataFetcher`    | `fetchOgMetadata`                 | 10s                    | 2x exponential (200ms base)              | Uses global `fetch` + `HTMLRewriter`  | Returns configurable `OgMetadata` or null           |
| `ContentExtractor`   | `fetchAndExtractContent`          | 15s                    | 2x exponential (300ms base)              | Uses global `fetch` + `htmlparser2`   | Returns configurable `ExtractedContent` or null     |
| `AiSummaryGenerator` | `env.AI.run()`                    | 30s                    | None (errors propagate as `AiCallError`) | Uses CF Workers AI binding            | Returns configurable summary + tags, or fails       |
| `LinkEventStore`     | `store.commit()`, `store.query()` | None (sync in-memory)  | None (idempotent)                        | Uses livestore store                  | Records commits in array, returns configurable tags |
| `SourceNotifier`     | Grammy `Api` reactions/replies    | None (fire-and-forget) | None (logs errors)                       | `new Api(token).setMessageReaction()` | Records reactions/replies in arrays                 |
| `FeatureStore`       | D1/Drizzle org query              | None                   | None                                     | `db.query.organization.findFirst()`   | Returns configurable `OrgFeatures`                  |
| `LinkRepository`     | livestore `Store` queries         | None (sync in-memory)  | None (idempotent)                        | `store.query()`, `store.commit()`     | In-memory arrays, records commits                   |

File structure:

```
link-processor/
  services.ts                          — 7 service Tags (4 original + 3 new)
  do-programs.ts                       — DO business logic as Effect programs
  process-link.ts                      — link processing pipeline
  durable-object.ts                    — stateful infrastructure only
  services/
    metadata-fetcher.live.ts           — 10s timeout, 2x retry
    content-extractor.live.ts          — 15s timeout, 2x retry
    ai-summary-generator.live.ts       — 30s timeout, no retry
    link-event-store.live.ts           — in-memory commits
    workers-ai.live.ts                 — CF Workers AI binding
    source-notifier.live.ts            — Telegram reactions/replies
    feature-store.live.ts              — D1/Drizzle org features
    link-repository.live.ts            — livestore Store queries
```

## Error Handling

| Service              | Error behavior                            | Rationale                                          |
| -------------------- | ----------------------------------------- | -------------------------------------------------- |
| `MetadataFetcher`    | Retry 2x → swallow → `null`               | Optional enrichment, link useful without it        |
| `ContentExtractor`   | Retry 2x → swallow → `null`               | Optional enrichment, AI falls back to metadata     |
| `AiSummaryGenerator` | Timeout 30s → **propagate `AiCallError`** | User should know summary failed, can retry from UI |

**Notification invariant:** Each link must be notified at most once. Two guards prevent double-notification: (1) `notified` column in `linkProcessingStatus` (persists across evictions via eventlog), (2) in-memory `notifiedLinkIds` Set (guards against subscription re-fire before the `linkSourceNotified` commit materializes).

AI failure flow:

```
AI fails → AiCallError propagates → processLink catchAllCause
  → commits linkProcessingFailed event
  → UI shows "Summary generation failed" + retry button
  → Telegram source gets 👎 reaction
```

## Dual-Path Ingestion Design

### Problems with previous architecture

**Ingestion coupling:** Telegram/API called `handleIngest()` which blocked on full LiveStore sync inside the DO before it could dedup or commit. Telegram webhooks could timeout.

**No direct SyncBackendDO push:** Every push requires `parentSeqNum` matching the current eventlog head. Without a synced client you don't know the head, and racing against other clients makes it unreliable.

**Source awareness missing:** The processor had no way to notify the ingestion source (e.g., Telegram reaction) after processing completes.

**Trigger indirection:** SyncBackendDO poked LinkProcessorDO with a blind "wake up" (no link ID). The DO replayed the entire eventlog just to discover which link needs processing.

### Design principles

1. **Two ingestion paths** — browser commits directly (already synced); external sources go through a queue (instant response)
2. **Link processor is source-agnostic** — it processes links, nothing more
3. **Source metadata lives in LiveStore events** — survives eviction, any subscriber can act on it
4. **Notifications are event-driven** — a separate subscription reacts to processing state changes

### Event schema change

Added `source` and `sourceMeta` to `linkCreated`:

```
v1.LinkCreated (original)            v2.LinkCreated (current)
─────────────────────                ──────────────────────────
id: string                           id: string
url: string                          url: string
domain: string                       domain: string
createdAt: Date                      createdAt: Date
                                     source: "app" | "api" | "telegram" | "chat"
                                     sourceMeta: JSON | null
```

`sourceMeta` is opaque to the processor. Each source defines its own shape:

| Source     | `sourceMeta`                        | Used for                          |
| ---------- | ----------------------------------- | --------------------------------- |
| `app`      | `null`                              | Browser sees results via sync     |
| `telegram` | `{ chatId, messageId }`             | React with emoji after processing |
| `api`      | `null` (or `{ webhookUrl }` future) | Caller already got 200            |
| `chat`     | `null`                              | Chat agent sees results via store |

### Two ingestion paths

```
PATH 1: BROWSER (direct commit)            PATH 2: EXTERNAL (queue)
──────────────────────────────              ────────────────────────

Browser has synced LiveStore client         Telegram ──webhook──→ Worker
  │                                           ├─ validate API key
  │ store.commit(linkCreated({                ├─ env.LINK_QUEUE.send({
  │   source: "app"                           │     url, orgId,
  │ }))                                       │     source: "telegram",
  │                                           │     sourceMeta: { chatId, messageId }
  │                                           │   })
  │                                           └─ return 200 immediately
  │
  │                                         API ──────────────→ Worker
  │                                           ├─ validate API key
  │                                           ├─ env.LINK_QUEUE.send({
  │                                           │     url, orgId,
  │                                           │     source: "api"
  │                                           │   })
  │                                           └─ return 200 immediately
  │
  ▼                                                     │
SyncBackendDO                                           ▼
  │                                         ┌───────────────────────┐
  │ onPush: detects linkCreated             │   Cloudflare Queue    │
  │                                         │   { url, orgId,       │
  │ fire-and-forget fetch                   │     source, meta }    │
  │ (wake up DO)                            │   retry + DLQ         │
  │                                         └───────────┬───────────┘
  │                                                     │
  │                                                     │ Queue Consumer
  │                                                     │ (wakes up DO directly)
  │                                                     │
  ▼                                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     LinkProcessorDO (per org)                       │
│                                                                     │
│  On wake from SyncBackendDO:        On wake from Queue Consumer:   │
│    1. sync store (livePull)           1. sync store (livePull)      │
│    2. pendingLinks$ fires             2. dedup check                │
│    3. processLink()                   3. commit linkCreated         │
│                                          (with source + meta)      │
│                                       4. pendingLinks$ fires       │
│                                       5. processLink()             │
│                                       6. return success/failure    │
│                                          to consumer               │
│                                          (ack or retry)            │
│                                                                     │
│  processLink() — same for both paths:                              │
│    MetadataFetcher (10s) → ContentExtractor (15s) →                │
│    AiSummaryGenerator (30s) → commit results                       │
│                                                                     │
│  processingStatus$ subscription:                                   │
│    └─ notifySource()                                               │
│       ├─ read linkCreated source + sourceMeta                      │
│       ├─ telegram → grammY Api.react() 👍/👎                      │
│       ├─ app → noop (browser sees via LiveStore sync)              │
│       └─ api → noop (caller already got 200)                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Queue configuration

```toml
[[queues.producers]]
queue = "link-processing"
binding = "LINK_QUEUE"

[[queues.consumers]]
queue = "link-processing"
max_batch_size = 1
max_retries = 3
max_concurrency = 1
dead_letter_queue = "link-processing-dlq"

[[queues.producers]]
queue = "link-processing-dlq"
binding = "LINK_DLQ"
```

### Queue consumer ack/retry logic

The queue only retries when the DO couldn't commit anything (infrastructure failure). Application-level processing failures are committed to LiveStore — the user can retry from the UI.

```
Consumer → LinkProcessorDO.ingestAndProcess(message)

CASE 1: Processing succeeds
  → DO syncs → dedup → commit linkCreated → processLink() → ✅
  → returns { status: "completed" }
  → consumer: message.ack()

CASE 2: Processing fails, but failure is committed
  → DO syncs → dedup → commit linkCreated → processLink()
  → metadata fetch hangs → timeout at 10s
  → processLink's catchAllCause → commits linkProcessingFailed
  → returns { status: "failed" }
  → consumer: message.ack()                    ← ACK, not retry
  → user sees "Failed" in UI, can click "Regenerate"
  → processingStatus$ fires → notifySource() → Telegram 👎

CASE 3: DO unreachable / store dead / no commit possible
  → HTTP call to DO fails or DO throws before committing
  → consumer: message not acked → queue retries automatically
  → after max_retries (3) → DLQ
```

### Edge cases

**Processing fails before reaching LiveStore:**
If the DO crashes (OOM, eviction) before committing any events, the link is in limbo. For queue-originated links, the queue retries automatically (message not acked). For browser-originated links, the existing `STUCK_TIMEOUT_MS` (5min) catches stuck links when the subscription fires.

**DO eviction during queue processing:**
The queue consumer's HTTP call to the DO fails → message is not acked → queue retries. On next attempt, the DO wakes fresh, syncs, and picks up where it left off.

**Duplicate queue messages:**
Dedup check in the DO (query by URL) prevents double-ingestion. If the link was already committed from a previous attempt, the DO skips ingest and just processes.

## Stale Link Cleanup

Links from v1 events that got stuck in production (started but never completed/failed, or never started at all). Uses a `linkProcessingCancelled` event — distinct from `linkProcessingFailed` (which implies a runtime error).

```
Link states where cancellation applies:
  linkCreated (no status)           → cancel: skip processing entirely
  linkProcessingStarted             → cancel: abort in-progress work
  linkProcessingFailed + pending    → cancel: stop retry attempts
```

**Critical: must not collide with active processing.** The `currentlyProcessing` set tracks in-flight links. Cancellation skips links in `currentlyProcessing`.

**Two mechanisms:**

1. **Startup sweep** — When the DO boots and syncs, before entering the normal processing loop, scan for links without a terminal status (`completed` or `cancelled`) where `updatedAt` is older than `STUCK_TIMEOUT_MS`. Commit `linkProcessingCancelled` for each.

2. **Cleanup endpoint** — `?cleanup=stale` on the DO's fetch handler. Syncs store, finds all non-terminal links older than threshold, commits `linkProcessingCancelled` for each, returns `{ cancelled: N }`.

Both mechanisms use the same scan logic:

```typescript
const staleLinks = links.filter((link) => {
  const status = statusMap.get(link.id);
  if (!status) return true; // never started
  if (status.status === "completed" || status.status === "cancelled")
    return false;
  return Date.now() - new Date(status.updatedAt).getTime() > STUCK_TIMEOUT_MS;
});
```

The materializer treats `cancelled` as a terminal state (like `completed`), so `pendingLinks$` never picks these up for processing.

## DO Platform Constraints

Verified 2026-02-27. Sources: [CF Durable Objects Limits](https://developers.cloudflare.com/durable-objects/platform/limits/), [Workers Limits](https://developers.cloudflare.com/workers/platform/limits/).

| Constraint                | Limit                                                       | Impact on LinkProcessorDO                                                   |
| ------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| CPU time                  | 30s default, configurable to 5min via `limits.cpu_ms`       | **Low** — most time is I/O wait (fetch, AI), which doesn't count toward CPU |
| Wall clock (HTTP request) | **Unlimited** while caller is connected                     | **None** — processing can take minutes                                      |
| Wall clock (alarm)        | 15 min                                                      | N/A — not using alarms                                                      |
| Memory                    | 128 MB (shared across same-class instances on same machine) | **Medium** — wasm SQLite + full eventlog in heap                            |
| Eviction                  | 70-140s inactivity (non-hibernateable)                      | Loses everything: `currentlyProcessing`, `cachedStore`, SQLite data         |
| Outbound connections      | 6 simultaneous                                              | **Low** — serial processing                                                 |
| Subrequests               | 10,000 per invocation (raised Feb 2026)                     | **None**                                                                    |

Key insight: **there is no wall clock or CPU limit that blocks link processing.** Past incidents were all app-level bugs (retry storms, materializer crashes, race conditions), not platform constraints.

## Livestore Sync: ServerAheadError and Rebase

`createStoreDoPromise` uses `initialSyncOptions: { _tag: 'Blocking', timeout: 500 }` by default (patched to 5000ms). When the eventlog is large (e.g., 1400+ events), the initial sync may not complete in time. The store returns partially synced, and events committed locally (linkCreated, linkProcessingStarted, etc.) try to push to SyncBackendDO with a stale `parentSeqNum`. These pushes fail with `ServerAheadError`.

**In-memory patch (required):** The `@livestore/adapter-cloudflare` package is patched to use `_tag: 'in-memory'` instead of `_tag: 'storage'` for both `dbState` and `dbEventlog`. VFS-backed storage (`CloudflareSqlVFS`) is not viable for two reasons:

1. **Write amplification:** VFS writes ~14k `rows_written` per link processed. With the account-wide 100k/day limit, this exhausts the quota after ~7 links. Confirmed in production on 2026-03-03 — hit 100k rows_written very quickly after re-enabling VFS.
2. **Materializer crashes:** VFS persistence causes `UNIQUE constraint failed` on `eventlog.seqNumGlobal` during boot (livestore's `insertIntoEventlog()` uses plain INSERT with no dedup), and `RuntimeError: function signature mismatch` in WASM changeset apply during rebase.

The trade-off: in-memory means full eventlog replay on every cold start. The initial sync timeout is patched from 500ms → 5000ms to accommodate this. For larger eventlogs, R2 snapshots (see Future Ideas) would be the proper solution.

**This is expected and handled by the sync protocol.** The recovery works as follows:

```
1. DO commits event locally
   → event applied to local state + added to syncState.pending
   → event enqueued in syncBackendPushQueue

2. Push fiber takes event from queue, pushes to SyncBackendDO
   → Server rejects: ServerAheadError (parentSeqNum < server head)
   → Push fiber parks: yield* Effect.never (waits for interrupt)

3. Pull stream delivers server events (the ones that caused the head to advance)
   → SyncState.merge() rebases all pending events onto new server head
   → restartBackendPushing() interrupts parked push fiber
   → Clears push queue, re-enqueues all rebased pending events
   → Starts new push fiber

4. New push fiber pushes rebased events successfully
   → Events reach SyncBackendDO → broadcast to browser clients
```

Key invariants:
- **`syncState.pending` is the source of truth** for uncommitted events, not the push queue. Events consumed from the queue are never lost — they're always in `pending` until confirmed.
- **`Effect.never` is a deliberate parking strategy**, not a deadlock. The pull side provides the interrupt via `restartBackendPushing`.
- **Multiple events** accumulated during catch-up are all preserved and rebased together.
- **The protocol guarantees** that a ServerAheadError always implies the server has new events the client hasn't seen yet, delivered via the pull stream.

The `ServerAheadError` flood visible in production logs during DO cold start is harmless noise. The `providedNum` values climbing (0 → 100 → 200 → ... → 1380) show the pull catching up in batches, with each batch triggering a rebase cycle until the client is fully synced.

**Note on `onPush` timing:** The SyncBackendDO's `onPush` callback fires *before* push validation in the livestore library. This means `triggerLinkProcessor` is called even for rejected pushes. These are wasted wake-ups but harmless — the processor's `ensureSubscribed` returns early and `processNextPending` checks `currentlyProcessing`.

Source: `readonly-llm-lookup/livestore/packages/@livestore/common/src/leader-thread/LeaderSyncProcessor.ts` (lines 893-979: `backgroundBackendPushing`, lines 377-388: `restartBackendPushing`, lines 731-848: `onNewPullChunk`).

## Implementation Log

Each group was tested independently. Groups 1–2 are the foundation, 3 is the migration, 4–6 can be done in any order after 3.

**Group 1: Schema changes** (no runtime impact, backwards-compatible) ✅

- [x] 1. Add `source` (nullable text) + `sourceMeta` (nullable text/JSON) columns to `links` table
- [x] 2. Add `v2.LinkCreated` event schema (`events.linkCreatedV2`) — keeps `v1.LinkCreated` working
- [x] 3. Add `v2.LinkCreated` materializer (populates new columns; `v1.LinkCreated` produces `null`)
- [x] 4. Add `linkProcessingCancelled` event + materializer (terminal state, uses `insert.onConflict("linkId", "replace")`)
- [x] 5. Add `linkSourceNotified` event + materializer (`notified` integer column on `linkProcessingStatus`, default 0)
- [x] 6. Update all 3 `linkCreated` call sites to v2 (`add-link-dialog.tsx` → `source: "app"`, `chat-agent/tools.ts` → `source: "chat"`, `durable-object.ts` → `source: "api"` temporary until queue path)
- [x] 7. Update `SyncBackendDO.onPush` to trigger on both `v1.LinkCreated` and `v2.LinkCreated` (`src/cf-worker/sync/index.ts`)
- [x] 8. Typecheck + lint + 8 unit tests pass (tools.test.ts has 37 pre-existing failures unrelated to this work)

**Group 2: Queue infrastructure** ✅

- [x] 8. Add queue config to `wrangler.toml` (producer `LINK_QUEUE` → `cloudstash-link-queue`, consumer with `max_retries: 3`, DLQ → `cloudstash-link-dlq`)
- [x] 9. Add `LINK_QUEUE: Queue<LinkQueueMessage>` binding to Env type + `LinkQueueMessage` interface in `link-processor/types.ts`
- [x] 10. Implement `queue()` handler in Worker (consumer: call DO RPC, ack on success, retry on error)
- [x] 11. Add `ingestAndProcess(msg: LinkQueueMessage)` RPC method to LinkProcessorDO (dedup → commit linkCreatedV2 → return status)
- [x] 12. Typecheck + lint + 8 unit tests pass (tools.test.ts has 37 pre-existing failures unrelated to this work)

**Group 3: External ingestion migration** ✅

- [x] 13. Update Telegram webhook handler to use `env.LINK_QUEUE.send()` with `source: "telegram"` + `sourceMeta: { chatId, messageId }` (telegram/handlers.ts)
- [x] 14. Update API ingest handler to use `env.LINK_QUEUE.send()` with `source: "api"` (ingest/service.ts)
- [x] 15. Remove old `handleIngest()` from DO + unused `InvalidUrlError` import (durable-object.ts)
- [x] 16. Typecheck + lint + tests pass

**Group 4: Notifications** ✅

- [x] 15. Add `unnotifiedResults$` computed subscription in DO (filtered by `notified = false`, `status = completed|failed`, skip `source: "app"`)
- [x] 16. Implement `notifySource()` dispatcher (Telegram via `new Api(env.TELEGRAM_BOT_TOKEN).setMessageReaction()`, fire-and-forget, commits `linkSourceNotified` regardless of success/failure)
- [x] 17. Typecheck + lint + tests pass

**Group 5: Stale link cleanup** ✅

- [x] 17. Add startup sweep: on DO boot, cancel stale non-terminal links older than `STUCK_TIMEOUT_MS`

**Group 6: UI** ✅

- [x] 20. Display ingestion source in link detail dialog ("Saved on ... via Telegram/API/Chat") — tested locally with Telegram
- [x] 21. Add `source` to `LinkWithDetailsSchema` and all link queries (`links.ts` + `filtered-links.ts`)
- [x] 22. Typecheck + lint + tests pass

**Group 7: Telegram handler Effect refactor + tests** ✅

Refactored `telegram/handlers.ts` from raw `ctx`/`env` dependencies to Effect services with layers, matching the `processLink` pattern. Enables unit testing without Grammy/Cloudflare mocks.

Reaction flow (all 7 paths):

```
PATH 1: New link, processing succeeds    →  👀 → 🤔 → 👍
PATH 2: New link, processing fails       →  👀 → 🤔 → 👎 + reply "Failed to process link."
PATH 3: Duplicate link                   →  👀 → 👌 + reply "Link already saved."
PATH 4: Queue send fails                 →  👀 → 👎 + reply "Failed to save link. Please try again later."
PATH 5: Not connected                    →  reply "Please connect first: /connect <api-key>"
PATH 6: Invalid/expired API key          →  👎 + reply "API key no longer valid..."
PATH 7: Rate limited                     →  👎 + reply "Too many links today..."
```

Services: `Messenger`, `SourceAuth`, `LinkQueue`, `TelegramKeyStore`

Steps:

- [x] 23. Create service tags in `telegram/services.ts`
- [x] 24. Create live layers (`messenger.live.ts`, `source-auth.live.ts`, `telegram-key-store.live.ts`, `link-queue.live.ts`)
- [x] 25. Rewrite `handlers.ts` as pure Effect programs
- [x] 26. Rewrite `bot.ts` as wiring layer
- [x] 27. Drop `MissingChatIdError` (bot.ts guards chatId before calling handlers)
- [x] 28. Add unit tests `__tests__/unit/telegram-handlers.test.ts` — 10 tests covering all 7 paths
- [x] 29. Typecheck + lint + tests pass

**Group 8: DO → Effect Programs refactor** ✅

Extracted 4 programs from the DO class into testable Effect programs:

| Program                                                | Type          | Services                       | What it replaced                                |
| ------------------------------------------------------ | ------------- | ------------------------------ | ----------------------------------------------- |
| `ingestLink(params)`                                   | Effect        | LinkRepository, SourceNotifier | `ingestAndProcess()` business logic             |
| `cancelStaleLinks(processing, now)`                    | Effect        | LinkRepository                 | `cancelStaleLinks()` private method             |
| `notifyResult(result)`                                 | Effect        | SourceNotifier, LinkRepository | `notifyResults()` private method                |
| `detectStuckLinks(pending, statuses, processing, now)` | Pure function | none                           | `onPendingLinksChanged()` stuck detection logic |

What stays in DO class (stateful infrastructure only):

- Store lifecycle: `getSessionId()`, `getStore()`, `ensureSubscribed()`
- Concurrency: `currentlyProcessing`, `reprocessQueue` sets
- HTTP/RPC handlers: `fetch()`, `syncUpdateRpc()`, `handleReprocess()`
- `processLinkAsync()` shell (manages concurrency, builds layers, delegates)
- `buildDoLayer()` helper for constructing the shared DO service layer

Steps:

- [x] 30. Add 3 service tags (`SourceNotifier`, `FeatureStore`, `LinkRepository`) to `services.ts`
- [x] 31. Create live layers (`source-notifier.live.ts`, `feature-store.live.ts`, `link-repository.live.ts`)
- [x] 32. Create `do-programs.ts` with 3 Effect programs + 1 pure function
- [x] 33. Refactor `durable-object.ts` to use extracted programs
- [x] 34. Add unit tests `__tests__/unit/do-programs.test.ts` — 14 tests
- [x] 35. Typecheck + lint + 22 unit tests pass (do-programs: 14, process-link: 8)
- [x] 36. Bugfix: `cancelStaleLinks` now also skips `"failed"` links (15 do-programs tests total)

**Group 9: Effect LSP diagnostics + AI error propagation** ✅

Installed `@effect/language-service` plugin and resolved all diagnostics (11 warnings + 18 messages). Key change: AI summary failures now propagate as `AiCallError` instead of being silently swallowed.

- [x] 37. Install `@effect/language-service@0.77.0`, add plugin to `tsconfig.json`
- [x] 38. Add `check:effect` script to `package.json`
- [x] 39. Create tagged error types: `QueueSendError`, `AiCallError`, `ContentExtractionError`, `EmailSendError`
- [x] 40. Replace `new Error(...)` with tagged errors in all service implementations
- [x] 41. Update service interfaces to use tagged errors
- [x] 42. Remove dead `catchAll` handlers (6 instances)
- [x] 43. Simplify `yield* Effect.fail(new XError())` → `yield* new XError()` (5 instances)
- [x] 44. Convert to `Effect.fn("name")` (3 instances)
- [x] 45. Replace try/catch with `Effect.try()` (2 instances)
- [x] 46. Replace `JSON.parse(sourceMeta)` with `Schema.parseJson(TelegramMeta)` (2 instances)
- [x] 47. Replace `Schema.decodeUnknownSync` with `yield* Schema.decodeUnknown` (1 instance)
- [x] 48. Remove `catchAll` from `generateSummary()` — `AiCallError` now propagates
- [x] 49. Update `AiSummaryGeneratorLive` — remove `catchAll`, map `TimeoutException` → `AiCallError`
- [x] 50. Update `AiSummaryGenerator` service interface error channel
- [x] 51. Restructure JSON parse fallback in `generateSummary` to use `Effect.orElseSucceed`
- [x] 52. Add test: "commits linkProcessingFailed when AI service fails"
- [x] 53. Typecheck + lint + Effect diagnostics + 272 unit tests pass

Files changed (Group 9):

| File                                                   | Change                                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `tsconfig.json`                                        | Added Effect language service plugin                                                          |
| `package.json`                                         | Added `check:effect` script                                                                   |
| `link-processor/generate-summary.ts`                   | Removed `catchAll`, return type `Effect<..., AiCallError>`, `orElseSucceed` for JSON fallback |
| `link-processor/services.ts`                           | `AiSummaryGenerator.generate` error channel: `never` → `AiCallError`                          |
| `link-processor/services/ai-summary-generator.live.ts` | Removed `catchAll`, `catchTag("TimeoutException")` → `AiCallError`                            |
| `link-processor/errors.ts`                             | Added `AiCallError`, `ContentExtractionError`                                                 |
| `ingest/errors.ts`                                     | Added `QueueSendError`                                                                        |
| `telegram/errors.ts`                                   | Added `QueueSendError`                                                                        |
| `email/errors.ts`                                      | **New** — `EmailSendError`                                                                    |
| `__tests__/unit/process-link.test.ts`                  | Added AI failure → `linkProcessingFailed` test (9 tests total)                                |
| + 12 more files                                        | Tagged error adoption, idiomatic Effect patterns                                              |

- [x] Tests for ingest service producer path (handleIngestRequest → LINK_QUEUE.send) — 8 tests in `ingest-service.test.ts`

## Post-Merge Fixes

**Infinite cascade from `detectStuckLinks` in subscription callback (2026-03-03):**

`onPendingLinksChanged` called `detectStuckLinks` → `store.commit(linkProcessingFailed)` for each stuck link. But `store.commit()` fires subscriptions **synchronously**, re-entering `onPendingLinksChanged`. During initial sync, incoming events overwrite the failed status back to "pending" (via `linkProcessingStarted` INSERT ON CONFLICT REPLACE), causing the same links to be detected as stuck infinitely. Produced hundreds of log entries per second.

Fix: removed `detectStuckLinks` from subscription callback entirely. Stuck link cleanup is already handled by `cancelStaleLinks` (runs once asynchronously on boot, uses `linkProcessingCancelled` with INSERT ON CONFLICT REPLACE).

Verified in production: all stuck links processed successfully after deploy. Telegram ingestion after DO hibernation also works correctly.

**Other hardening:**

- `cancelStaleLinks` guarded with `hasRunCleanup` flag — runs once per DO lifetime, not on every store recreation
- `syncUpdateRpc` calls `processNextPending` after `handleSyncUpdateRpc` as fallback in case subscription didn't fire
- Notification dedup via in-memory `notifiedLinkIds` Set (see Error Handling section)

## Future Ideas

**R2 Snapshots:** When eventlog reaches ~5k–10k events, cold start becomes expensive (full replay on every wake-up). R2 snapshots would serialize all 3 in-memory DBs to a single R2 object, restoring on wake-up with only delta sync. See [history doc](./link-processor-refactor-history.md#r2-snapshot-future-idea) for full design.

**Observability (already available):**

- `bun dev` — structured console logs from Effect.ts `logInfo/logWarning/logError`
- `bun run dev:dashboard` — Localflare dashboard for D1 inspection, DO state viewing, Queue inspector
- Livestore devtools — browser devtools panel showing events, materialized state, sync status
- Chrome DevTools — press `D` in terminal for CPU profiling flame graphs
- Effect span timing — modify `runWithLogger` to include `ConsoleSpanExporter` for span hierarchy with timing

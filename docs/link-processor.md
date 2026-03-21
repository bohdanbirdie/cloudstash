# LinkProcessorDO

## Overview

LinkProcessorDO processes newly saved links: fetches metadata, extracts content, generates AI summaries, and suggests tags. It runs as a Durable Object hosting a livestore client (native DO SQLite for eventlog, optimized VFS for state) to participate in event-sourcing sync.

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
│  │ LiveStore Client (native DO SQLite + optimized VFS)     │     │
│  │  livePull ──→ persisted state, no full replay needed   │     │
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

### Design principles

1. **Two ingestion paths** — browser commits directly (already synced); external sources go through a queue (instant response)
2. **Link processor is source-agnostic** — it processes links, nothing more
3. **Source metadata lives in LiveStore events** — survives eviction, any subscriber can act on it
4. **Notifications are event-driven** — a separate subscription reacts to processing state changes

### Event schema

`linkCreated` includes `source` and `sourceMeta`:

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

Links that got stuck (started but never completed/failed, or never started at all). Uses a `linkProcessingCancelled` event — distinct from `linkProcessingFailed` (which implies a runtime error).

**Two mechanisms:**

1. **Startup sweep** — When the DO boots and syncs, scan for links without a terminal status (`completed` or `cancelled`) where `updatedAt` is older than `STUCK_TIMEOUT_MS`. Commit `linkProcessingCancelled` for each. Guarded with `hasRunCleanup` flag — runs once per DO lifetime.

2. **Cleanup endpoint** — `?cleanup=stale` on the DO's fetch handler. Syncs store, finds all non-terminal links older than threshold, commits `linkProcessingCancelled` for each, returns `{ cancelled: N }`.

## Telegram Notification Flow

```
PATH 1: New link, processing succeeds    →  👀 → 🤔 → 👍
PATH 2: New link, processing fails       →  👀 → 🤔 → 👎 + reply "Failed to process link."
PATH 3: Duplicate link                   →  👀 → 👌 + reply "Link already saved."
PATH 4: Queue send fails                 →  👀 → 👎 + reply "Failed to save link. Please try again later."
PATH 5: Not connected                    →  reply "Please connect first: /connect <api-key>"
PATH 6: Invalid/expired API key          →  👎 + reply "API key no longer valid..."
PATH 7: Rate limited                     →  👎 + reply "Too many links today..."
```

Telegram handler services: `Messenger`, `SourceAuth`, `LinkQueue`, `TelegramKeyStore`

## DO Platform Constraints

| Constraint                | Limit                                                       | Impact on LinkProcessorDO                                                   |
| ------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| CPU time                  | 30s default, configurable to 5min via `limits.cpu_ms`       | **Low** — most time is I/O wait (fetch, AI), which doesn't count toward CPU |
| Wall clock (HTTP request) | **Unlimited** while caller is connected                     | **None** — processing can take minutes                                      |
| Wall clock (alarm)        | 15 min                                                      | N/A — not using alarms                                                      |
| Memory                    | 128 MB (shared across same-class instances on same machine) | **Medium** — wasm SQLite + full eventlog in heap                            |
| Eviction                  | 70-140s inactivity (non-hibernateable)                      | Loses everything: `currentlyProcessing`, `cachedStore`, SQLite data         |
| Outbound connections      | 6 simultaneous                                              | **Low** — serial processing                                                 |
| Subrequests               | 10,000 per invocation (raised Feb 2026)                     | **None**                                                                    |

## DO Class Structure

What stays in the DO class (stateful infrastructure only):

- Store lifecycle: `getSessionId()`, `getStore()`, `ensureSubscribed()`
- Concurrency: `currentlyProcessing`, `reprocessQueue` sets
- HTTP/RPC handlers: `fetch()`, `syncUpdateRpc()`, `handleReprocess()`
- `processLinkAsync()` shell (manages concurrency, builds layers, delegates)
- `buildDoLayer()` helper for constructing the shared DO service layer

## Observability

- `bun dev` — structured console logs from Effect.ts `logInfo/logWarning/logError`
- `bun run dev:dashboard` — Localflare dashboard for D1 inspection, DO state viewing, Queue inspector
- Livestore devtools — browser devtools panel showing events, materialized state, sync status
- Chrome DevTools — press `D` in terminal for CPU profiling flame graphs
- Effect span timing — modify `runWithLogger` to include `ConsoleSpanExporter` for span hierarchy with timing

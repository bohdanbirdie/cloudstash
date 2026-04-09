# Telegram Concurrent Link Processing

Status: **in progress** — core mechanics working, draft streaming needs refinement.

## Next steps (unfinished)

1. **Draft message stability** — multiple rapid `sendProgressDraft` calls may arrive at Telegram out of order. Needs debounce or sequencing.
2. **ManagedRuntime** — `Effect.unsafeMakeSemaphore` works but investigate `ManagedRuntime` to replace scattered `runEffect` calls. Tracked in [[todos/managed-effect-runtime-do]].
3. **SQLite ProgressTracker review** — evaluate whether a stateful SQLite-backed approach would perform better than stateless queries. Tracked in [[todos/progress-tracker-sqlite-review]].
4. **Close kanban items** — move queue-config-explicitness and concurrency tasks to Done, commit changes.

## What we built

Concurrent link processing in LinkProcessorDO with real-time Telegram draft streaming.

### Concurrency model

- `Effect.Semaphore(MAX_CONCURRENT_LINKS = 5)` gates processing
- `pendingLinks$` livestore subscription feeds new links into `Effect.forEach({ concurrency: "unbounded" })`
- Semaphore manages the actual concurrency — no manual slot calculation
- `submittedLinks` Set prevents re-submission when subscription fires again
- Source-agnostic: browser, Telegram, and API links all enter the same pipeline

### Queue handler

- `max_batch_size = 5`, `max_concurrency = 1` in wrangler.toml
- Queue handler processes batch with `Effect.forEach({ concurrency: BATCH_CONCURRENCY = 5 })`
- Each message calls `ingestAndProcess()` RPC — fast (just commits event, returns)
- Heavy processing is reactive via the subscription, not the queue

### Telegram draft streaming (stateless)

Uses `sendMessageDraft` (Bot API 9.3+) — a floating draft bubble tied to the user's original message. The draft is **stateless**: `getProgressDraftText` queries the store and renders whatever is true right now. No in-memory state, no ordering concerns — can be called from any code path at any time, always reflects current system state.

- **No `linkProcessingStatus` row** → link just ingested, waiting for semaphore → "Saving link: domain"
- **Status `pending`** (from `linkProcessingStarted` event) → actively processing → "Processing link: domain"
- **Terminal status** (`completed`, `failed`, `cancelled`) → excluded from draft

```
Processing link: a.com
Saving link: b.com
```

Draft is sent at these points:

1. `ingestAndProcess` → after `linkCreatedV2` committed
2. `processLinkEffect` → after `linkProcessingStarted` committed
3. `processLinkEffect` ensuring block → after terminal status committed
4. `notifyResults` → after each confirmation `sendMessage` (re-sends draft)

Point 4 is critical: `sendMessage` with `reply_parameters` referencing the same message **clears the draft bubble**. Since confirmation messages reply to the user's original message, they kill the active draft. After each confirmation, `sendProgressDraft` is re-called — if links remain active, the draft reappears; if all are done, the query returns null and no stale draft is sent.

Survives DO eviction — state is reconstructed from livestore queries on next boot. No in-memory tracker needed.

### Boot cleanup

On startup, `cancelStaleLinks` cancels links stuck without terminal status for >5 minutes. For cancelled telegram links, a "Processing was interrupted" reply is sent to affected chats (deduped by chatId).

Confirmation messages (`Link saved! [summary]`) sent independently per link via `unnotifiedResults$` subscription.

### Files changed

- `src/cf-worker/link-processor/durable-object.ts` — semaphore, subscription-driven forEach, stateless progress queries, boot cleanup
- `src/cf-worker/link-processor/progress-draft.ts` — `buildTelegramProgress`, `queryTelegramProgress`, `getProgressDraftText`, `renderProgressDraft`, `parseMeta` (Schema-based), `evictOldestFromSet`
- `src/cf-worker/link-processor/do-programs.ts` — `cancelStaleLinks` returns `CancelledLinkInfo[]`, removed `streamProgress("Fetching metadata")` from `ingestLink`
- `src/cf-worker/link-processor/process-link.ts` — `skipStartedEvent` option (DO commits `linkProcessingStarted` before calling `processLink`)
- `src/cf-worker/link-processor/services.ts` — `SourceNotifier` interface (removed `finalizeGroupProgress`)
- `src/cf-worker/link-processor/services/source-notifier.live.ts` — removed group payload formatting
- `src/cf-worker/queue-handler.ts` — `BATCH_CONCURRENCY = 5`, `catchTag` instead of `catchAll`
- `src/cf-worker/telegram/handlers.ts` — "Saving N links" draft for multi-link
- `src/cf-worker/telegram/services/link-queue.live.ts` — reverted to 3 params (removed `totalInMessage`)
- `src/cf-worker/telegram/bot.ts` — reverted `LinkQueueLive` call
- `wrangler.toml` — explicit `max_batch_size`, `max_concurrency`

### Test coverage (412 tests total)

- `renderProgressDraft` — 6 tests (single/multi link, mixed stages, ordering)
- `buildTelegramProgress — stage derivation` — 8 tests (no links, saving/processing/completed/failed/cancelled stages, non-telegram excluded, different chatId excluded, empty domain fallback)
- `buildTelegramProgress — multi-link states` — 6 tests (both saving, both processing, mixed, completed excluded, independent chats, 5-link mixed)
- `buildTelegramProgress — DO lifecycle scenarios` — 9 tests (single lifecycle, concurrent A/B, B-before-A, two users, mixed sources, eviction recovery, 3-link staggered, failed/cancelled/reprocess-requested)
- `cancelStaleLinks` — 5 tests (returns CancelledLinkInfo[], skips processing/completed/failed/fresh)
- `Semaphore concurrency` — 3 tests (respects limit, releases on defect, dedup prevents double-submit)

## Open items

### Draft message stability

Tested locally — works for 1 link and 2 links. Potential issues:

- Multiple rapid `sendProgressDraft` calls could arrive at Telegram out of order
- No visible logging for successful draft sends (only failures logged)
- The initial bot-level "Saving N links" draft may conflict with the DO-level progress draft

### ManagedRuntime investigation

Tracked in [[todos/managed-effect-runtime-do]]. `Effect.unsafeMakeSemaphore` works but the DO has growing imperative-to-Effect bridges. A `ManagedRuntime` could own the semaphore, layers, and replace scattered `runEffect` calls.

### Kanban items to close

- [[todos/queue-config-explicitness]] — done (explicit `max_batch_size`, `max_concurrency` in wrangler.toml, `BATCH_CONCURRENCY` constant in code)
- "Add concurrency (5 or so) to link processor DO" — done (semaphore-based, `MAX_CONCURRENT_LINKS = 5`)

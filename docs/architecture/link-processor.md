# LinkProcessorDO

Durable Object that processes newly saved links: fetches metadata, extracts content, generates AI summaries, and suggests tags. Runs as a livestore client (native DO SQLite for eventlog) connected to `SyncBackendDO`.

## Architecture

![[diagrams/link-processor.excalidraw]]

## Dual-Path Ingestion

**Browser path:** User saves link in app → `linkCreated` committed via livestore sync → `SyncBackendDO.onPush` detects it → fire-and-forget wakes `LinkProcessorDO` → `pendingLinks$` subscription fires → processing starts.

**External path (Telegram, API/Raycast):** Request hits worker → enqueued to Cloudflare Queue → queue consumer calls `LinkProcessorDO.ingestAndProcess()` → dedup check → commits `linkCreatedV2` (with `source` + `sourceMeta`) → `pendingLinks$` subscription fires → processing starts.

`onPush` also detects `linkReprocessRequested` events to trigger reprocessing from the UI.

## Concurrent Processing

Processing is driven by a single reactive subscription (`pendingLinks$`) that fires whenever the set of pending links changes. The subscription feeds new links into an `Effect.Semaphore`-gated pipeline:

```
pendingLinks$ subscription fires
  │
  ├─ filter out already-submitted links (submittedLinks Set, dedup only)
  ├─ add new links to submittedLinks
  │
  └─ Effect.forEach(newLinks, processOne, { concurrency: "unbounded" })
       │
       └─ semaphore.withPermits(1)(processLinkEffect)
            │
            └─ Effect.ensuring → remove from submittedLinks
```

- `Effect.Semaphore(MAX_CONCURRENT_LINKS = 5)` is the sole concurrency control
- `Effect.forEach` with `concurrency: "unbounded"` submits all links; the semaphore gates how many actually run at once
- `submittedLinks` Set prevents re-submission when the subscription fires again with the same pending links
- No manual slot calculation, no recursion — the semaphore manages the work queue

This is source-agnostic: browser-synced links, Telegram links, and API links all enter through the same subscription and pipeline.

## Processing Pipeline

`processLink()` runs as an Effect pipeline per link:

1. Commit `linkProcessingStarted`
2. `MetadataFetcher` — fetch OG metadata (10s timeout, 2x retry, swallow failure)
3. `ContentExtractor` — extract page content (15s timeout, 2x retry, swallow failure)
4. `AiSummaryGenerator` — generate summary via Workers AI (30s timeout, no retry, **propagates error**)
5. Commit `linkProcessingCompleted` or `linkProcessingFailed`

AI is only invoked when `aiSummaryEnabled` is true for the org (checked via `FeatureStore`).

## Source Notifications

Two independent notification mechanisms:

### Confirmation messages (per-link, immediate)

The `unnotifiedResults$` livestore subscription fires when a link reaches `completed` or `failed` status. For each result, `notifyResult` calls `SourceNotifier.finalizeProgress`:

- **telegram** → sends formatted HTML reply via `api.sendMessage()` with summary and tag suggestions
- **app** → noop (browser sees results via livestore sync)
- **api/chat** → noop (caller already got 200 / sees via store)

After each telegram confirmation, `sendProgressDraft` is re-called to restore the draft bubble if links remain active (see draft/confirmation interaction below).

Double-notification guard: `linkSourceNotified` event + in-memory `notifiedLinkIds` Set (bounded at 500, evicts oldest).

### Progress draft (Telegram streaming, stateless)

Uses `sendMessageDraft` (Bot API 9.3+) — a floating draft bubble tied to the user's original message. The draft is **stateless**: `getProgressDraftText` queries the store and renders whatever is true right now. No in-memory state, no ordering concerns — can be called from any code path at any time.

```
Saving link: example.com          ← ingested, no linkProcessingStatus row yet
Processing link: other.com        ← linkProcessingStarted committed (status = "pending")
```

Stage derivation from store:

- No `linkProcessingStatus` row → **saving** (just ingested, waiting for semaphore)
- Status `"pending"` → **processing** (actively running pipeline)
- Terminal status (`completed`/`failed`/`cancelled`) → excluded from draft

Draft is sent at these points:

1. `ingestAndProcess` → after `linkCreatedV2` committed
2. `processLinkEffect` → after `linkProcessingStarted` committed
3. `processLinkEffect` ensuring block → after terminal status committed
4. `notifyResults` → after each confirmation `sendMessage` (re-sends draft)

#### Draft/confirmation interaction

`sendMessageDraft` creates a floating bubble tied to a `messageId`. When `sendMessage` is called with `reply_parameters` referencing the same message, Telegram **clears the draft bubble**. Since confirmation messages reply to the user's original message, they kill the active draft.

To handle this, `notifyResults` re-calls `sendProgressDraft` after each confirmation. The query reflects the current store state — if links remain active, the draft reappears. If all links are done, the query returns null and no stale draft is sent.

Survives DO eviction — state is reconstructed from livestore queries on next boot. Each chat's progress is derived from `sourceMeta` (chatId). Non-telegram sources are ignored.

## Queue Consumer

The queue handles external ingestion only. `max_batch_size = 5`, `max_concurrency = 1`. Queue handler processes messages with `Effect.forEach({ concurrency: 5 })` — each call is a fast RPC to `ingestAndProcess` (commits event, returns immediately). The heavy processing is triggered reactively by the subscription.

The queue only retries infrastructure failures. Application-level failures are committed to livestore (user retries from UI):

- DO returns any result (success/failure/duplicate) → `message.ack()`
- DO unreachable or throws before committing → message not acked → queue retries → DLQ after `max_retries`

## Stale Link Cleanup

Links stuck without terminal status older than 5 minutes get cancelled via `linkProcessingCancelled` event. Runs once per DO lifetime on boot (`hasRunCleanup` flag). For cancelled telegram links, a "Processing was interrupted" reply is sent to affected chats.

## DO Platform Constraints

Key limits: 30s default CPU (configurable), 128MB memory shared across same-class instances, eviction after ~70-140s inactivity. Most processing time is I/O wait (fetch, AI calls) which doesn't count toward CPU.

Eviction loses all in-memory state (`submittedLinks`, `cachedStore`, SQLite data). Progress draft state is stateless (derived from store queries), so it survives eviction. Queue-originated links retry automatically (message not acked). Browser-originated stuck links are caught by the stale cleanup on next boot.

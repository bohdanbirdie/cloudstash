# LinkProcessorDO

Durable Object that processes newly saved links: fetches metadata, extracts content, generates AI summaries, and suggests tags. Runs as a livestore client (native DO SQLite for eventlog) connected to `SyncBackendDO`.

## Architecture

![[diagrams/link-processor.excalidraw]]

## Dual-Path Ingestion

**Browser path:** User saves link in app → `linkCreated` committed via livestore sync → `SyncBackendDO.onPush` detects it → fire-and-forget wakes `LinkProcessorDO` → `pendingLinks$` subscription fires → processing starts.

**External path (Telegram, API/Raycast):** Request hits worker → enqueued to Cloudflare Queue → queue consumer calls `LinkProcessorDO.ingestAndProcess()` → dedup check → commits `linkCreatedV2` (with `source` + `sourceMeta`) → `pendingLinks$` subscription fires → processing starts.

`onPush` also detects `linkReprocessRequested` events to trigger reprocessing from the UI.

## Concurrent Processing

![[diagrams/concurrent-processing.excalidraw]]

Processing is driven by a single reactive subscription (`pendingLinks$`) that fires whenever the set of pending links changes. The subscription feeds new links into an `Effect.Semaphore`-gated pipeline:

```text
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

`Effect.Semaphore(MAX_CONCURRENT_LINKS = 5)` is the sole concurrency control. `submittedLinks` Set prevents re-submission when the subscription fires again. Source-agnostic: browser, Telegram, and API links all enter the same pipeline.

## Processing Pipeline

`processLink()` runs as an Effect pipeline per link:

1. Commit `linkProcessingStarted` (DO commits this before calling `processLink` with `skipStartedEvent: true`)
2. `MetadataFetcher` — fetch OG metadata (10s timeout, 2x retry, swallow failure)
3. `ContentExtractor` — extract page content (15s timeout, 2x retry, swallow failure)
4. `AiSummaryGenerator` — generate summary via Workers AI (30s timeout, no retry, **propagates error**)
5. Commit `linkProcessingCompleted` or `linkProcessingFailed`

AI is only invoked when `aiSummaryEnabled` is true for the org (checked via `FeatureStore`).

## Source Notifications

### Confirmation messages (per-link)

The `unnotifiedResults$` livestore subscription fires when a link reaches `completed` or `failed` status. `notifyResult` calls `SourceNotifier.finalizeProgress` → telegram sends formatted HTML reply, app/api are noops.

Double-notification guard: `linkSourceNotified` event + in-memory `notifiedLinkIds` Set (bounded at 500).

### Progress draft (Telegram, stateless)

Uses `sendMessageDraft` (Bot API 9.3+) — a floating draft bubble tied to the user's original message. The draft is **stateless**: queries the store and renders current state. No in-memory tracking — can be called from any code path and always reflects truth.

Stage is derived from `linkProcessingStatus`: no row = "Saving", `pending` = "Processing", terminal = excluded.

**Draft/confirmation interaction:** `sendMessage` with `reply_parameters` clears the draft bubble. After each confirmation, `sendProgressDraft` is re-called to restore the draft if links remain active. See [[features/telegram-concurrent-processing]] for details.

## Queue Consumer

External ingestion only. `max_batch_size = 5`, `max_concurrency = 1`. Each queue message is a fast RPC to `ingestAndProcess` (commits event, returns). Heavy processing is reactive via subscription.

Queue retries only infrastructure failures (DO unreachable). Application failures are committed to livestore.

## Stale Link Cleanup

Links stuck without terminal status for >5 minutes get cancelled via `linkProcessingCancelled` event. Runs once per DO lifetime on boot. For cancelled telegram links, a "Processing was interrupted" reply is sent.

## DO Platform Constraints

Key limits: 30s default CPU (configurable), 128MB memory, eviction after ~70-140s inactivity. Most processing time is I/O wait (doesn't count toward CPU).

Eviction loses in-memory state (`submittedLinks`, `cachedStore`). Progress draft survives (stateless). Queue-originated links retry automatically. Browser-originated stuck links are caught by stale cleanup on next boot.

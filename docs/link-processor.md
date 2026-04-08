# LinkProcessorDO

Durable Object that processes newly saved links: fetches metadata, extracts content, generates AI summaries, and suggests tags. Runs as a livestore client (native DO SQLite for eventlog) connected to `SyncBackendDO`.

## Architecture

![[diagrams/link-processor.excalidraw]]

## Dual-Path Ingestion

**Browser path:** User saves link in app → `linkCreated` committed via livestore sync → `SyncBackendDO.onPush` detects it → fire-and-forget wakes `LinkProcessorDO` → `pendingLinks$` subscription fires → `processLink()`.

**External path (Telegram, API/Raycast):** Request hits worker → enqueued to Cloudflare Queue → queue consumer calls `LinkProcessorDO.ingestAndProcess()` → dedup check → commits `linkCreatedV2` (with `source` + `sourceMeta`) → `processLink()`.

`onPush` also detects `linkReprocessRequested` events to trigger reprocessing from the UI.

## Processing Pipeline

`processLink()` runs as an Effect pipeline, same for both paths:

1. Commit `linkProcessingStarted`
2. `MetadataFetcher` — fetch OG metadata (10s timeout, 2x retry, swallow failure)
3. `ContentExtractor` — extract page content (15s timeout, 2x retry, swallow failure)
4. `AiSummaryGenerator` — generate summary via Workers AI (30s timeout, no retry, **propagates error**)
5. Commit `linkProcessingCompleted` or `linkProcessingFailed`

AI is only invoked when `aiSummaryEnabled` is true for the org (checked via `FeatureStore`).

## Source Notifications

After processing completes/fails, `SourceNotifier` reads the link's `source` and `sourceMeta` to notify the originator:

- **telegram** → sends formatted text reply via `api.sendMessage()` (not emoji reactions)
- **app** → noop (browser sees results via livestore sync)
- **api/chat** → noop (caller already got 200 / sees via store)

Double-notification guard: `linkSourceNotified` event + in-memory `notifiedLinkIds` Set.

## Queue Consumer

The queue only retries infrastructure failures. Application-level failures are committed to livestore (user retries from UI):

- DO returns any result (success/failure/duplicate) → `message.ack()`
- DO unreachable or throws before committing → message not acked → queue retries → DLQ after `max_retries`

## Stale Link Cleanup

Links stuck without terminal status older than 5 minutes get cancelled via `linkProcessingCancelled` event. Runs once per DO lifetime on boot (`hasRunCleanup` flag).

## DO Platform Constraints

Key limits: 30s default CPU (configurable), 128MB memory shared across same-class instances, eviction after ~70-140s inactivity. Most processing time is I/O wait (fetch, AI calls) which doesn't count toward CPU.

Eviction loses all in-memory state (`currentlyProcessing`, `cachedStore`, SQLite data). Queue-originated links retry automatically (message not acked). Browser-originated stuck links are caught by the stale cleanup on next boot.

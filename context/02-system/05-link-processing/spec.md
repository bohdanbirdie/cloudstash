# Link Processing — Spec

This document specifies the enrichment pipeline. It builds on
[requirements.md](./requirements.md).

## Status

Active.

## Processor Topology

`LinkProcessorDO` is one server-side LiveStore client per workspace. Store boot
is single-flight. Once booted, it subscribes to a computed set of active links
whose processing status is absent, pending, or reprocess-requested.

```text
pendingLinks$ change
  → remove IDs already in submittedLinks
  → metadata semaphore (max 8)
       → metadata fetch/snapshot event
       → AI semaphore (max 3)
            → content extraction
            → summary + tag-suggestion events
       → completed/failed event
  → source result subscription/notification
  → leader durability barrier for processing fibers attached to ctx.waitUntil
```

`submittedLinks` prevents duplicate concurrent fibers but is disposable. On
eviction, persisted events/materialized statuses rebuild pending work.

## Metadata and Content

Metadata extraction tries registered host-specific extractors, then fetches HTML
with `CloudstashBot`, parses JSON-LD/OpenGraph/Twitter/title/link elements, and
merges the best fields. The separate `/api/metadata` endpoint caches successful
responses for one day and is not the authoritative processing path.

Readable content extraction:

- accepts only HTTP(S) and revalidates each redirect;
- follows at most five redirects;
- aborts after fifteen seconds;
- caps response bodies at 5 MB;
- uses Defuddle + linkedom to produce Markdown without images;
- returns no content below the readable-content threshold;
- retains extracted content only for the current AI call.

## Summary and Tags

For entitled workspaces, the basic summarizer sends at most 4,000 characters of
sanitized content/metadata to Cloudflare Workers AI model
`@cf/meta/llama-3.3-70b-instruct-fp8-fast`. It forces a structured tool call
validated by Zod. The output is a two-to-three-sentence summary, up to two names
from existing tags, and at most one new tag.

X tweet links in entitled Pro workspaces first attempt the X enrichment path,
which has a per-workspace monthly KV cap and may use OpenRouter/Gemini. Every
typed enrichment/provider/usage failure falls back to the basic Workers AI
summary. Basic AI call timeout is thirty seconds and commits `AiCallError` on
failure.

Suggested tags are sanitized, fuzzy-matched against existing tags, skipped when
already effective on the link, and committed as separate `TagSuggested` events.

## Lifecycle and Notification

The processor owns `LinkProcessingStarted`; clients request reprocessing by
committing `LinkReprocessRequested`. Expected terminal outcomes commit completed
or a compact failure category (`fetch:<status>`, `fetch:unreadable`,
`fetch:timeout`, `AiCallError`).

A second computed subscription finds terminal results with an external source
and no notification event. Telegram notifications and draft progress are best-effort. Terminal-notification
subscription handling, stale cancellation, and digest scheduling currently have
detached execution paths that are not consistently held by `ctx.waitUntil`; see
[DELTA-018](../../.delta/DELTA-018-detached-sync-consequences-are-eviction-sensitive.md). The notifier
currently catches Telegram send failures and the caller still commits
`LinkSourceNotified`, so that event means the final notification path was
attempted rather than proving provider delivery; see
[DELTA-023](../../.delta/DELTA-023-source-notification-event-overstates-delivery.md). In-memory
sets are bounded duplicate suppression, not the source of truth.

Once per DO lifetime, stale links older than the configured threshold are
cancelled. Interrupted Telegram work receives a resend prompt.

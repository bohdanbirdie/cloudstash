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
merges the best fields. The separate `/api/metadata` preview helper is an
internal, non-authoritative path. It requires the normal approved-session and
current-workspace decision before outbound work, applies dedicated per-user
abuse protection, and returns non-cacheable responses. Its failure remains
silent in the add-link flow because `LinkProcessorDO` performs authoritative
enrichment independently.

Metadata preview and processing share the bounded fetch implementation. Targets
and every redirect must remain HTTP(S); credentials, raw address literals,
obvious internal names, and the application host are rejected. Redirect count,
elapsed time, accepted content type, and bytes consumed are bounded before HTML
parsing. Provider-specific extractor requests use the same deadline and body
bounds, and parsed image/favicon values must resolve to HTTP(S). The runtime has
no independent pre-fetch DNS resolution step, so authentication, per-location
rate protection, and fetch bounds remain part of the defense for accepted host
names; the rate protection is not a global usage-accounting cap.

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
validated by Zod with a 384-token output ceiling. Its existing-tag vocabulary is
sorted deterministically and capped at 100 entries. The output is a
two-to-three-sentence summary, up to two names from existing tags, and at most
one new tag.

Before AI work, LinkProcessorDO reserves one idempotent summary attempt in the
workspace's subscription-aligned monthly counter. Exhaustion or unavailable
accounting preserves metadata and completes processing without a summary.

X tweet links in entitled Pro workspaces first attempt the X enrichment path,
which has a separate per-workspace monthly Durable Object counter and uses the
shared OpenRouter model. Every
typed enrichment/provider/usage failure falls back to the basic Workers AI
summary. X enrichment uses the same bounded 100-entry tag vocabulary, explicit
`none` reasoning, and its existing output safety envelope. Basic AI call timeout
is thirty seconds and commits `AiCallError` on failure. The prompt-envelope
choice is recorded in
[decision 0003](./.decisions/0003-bound-summary-prompt-envelopes.md).
The shared OpenRouter reasoning policy is recorded in
[retrieval decision 0005](../06-retrieval-and-agent/.decisions/0005-set-reasoning-by-workload.md).

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

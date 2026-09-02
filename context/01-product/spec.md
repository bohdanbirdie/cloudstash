# Product — Spec

This document specifies the current product experience. It builds on
[requirements.md](./requirements.md).

## Status

Active.

## Product Loop

```text
capture → visible link → metadata/enrichment → skim → search/tag → read/archive
```

The primary authenticated surface is a compact link inbox with Inbox,
Completed, All, and Archive views. A right pane shows selected-link detail,
summary, tags, and contextual actions. A bottom dock provides search and the
workspace agent. Desktop keyboard interaction and mobile sheets expose the same
underlying library operations.

## Capture Surfaces

| Surface          | Current behavior                                                | Default plan availability |
| ---------------- | --------------------------------------------------------------- | ------------------------- |
| Web app          | Paste/type an HTTP(S) URL; commit locally                       | Free                      |
| Chrome extension | Pair from web, save active tab, sync recent links               | Free                      |
| Telegram         | Connect bot, send/forward URLs, receive progress and result     | Plus                      |
| Raycast          | Browser handoff mints a paired key; save from macOS             | Plus                      |
| Public API       | Bearer key; `POST /api/ingest` and `GET /api/links`             | Plus                      |
| X bookmarks      | Poll new bookmarks from connect-time onward                     | Pro                       |
| Chat agent       | Save, search, inspect, complete, restore, and archive via tools | Pro                       |

Every capture reaches the same workspace content model. Browser and extension
clients commit through LiveStore; external request sources enqueue ingestion;
chat calls the workspace `LinkProcessorDO`, which commits through the existing
canonical server-side LiveStore client.

## Link Experience

A link has independent dimensions:

- reading status: unread or completed;
- archival state: active or archived via `deletedAt`;
- processing status: absent/pending/reprocess-requested/completed/failed/cancelled;
- zero or more metadata snapshots and summaries, with the newest displayed;
- explicit tags and pending AI tag suggestions.

Archiving a link is reversible. Account deletion is a separate irreversible
lifecycle.
Duplicate URL saves within one workspace resolve to the existing link rather
than creating parallel visible entries.

## Search and Organization

Search executes against local SQLite and requires every query word to match at
least one of title, effective tag, domain, description, summary, or URL. Results
are relevance-ranked. Filters can require all selected effective tags. Pending
AI tag suggestions act as effective tags while remaining visibly distinguishable
from explicit tags.

## Plans

[`src/lib/plan.ts`](../../src/lib/plan.ts) owns executable plan copy and default
capability values. Current bundles are:

- **Free:** up to 100 active links and 10 AI summaries each month, with Chrome
  capture, tags, archiving, search, sync, and export.
- **Plus:** up to 500 active links, 500 AI summaries, and 1,000 public API calls
  each month, plus Telegram, Raycast, and weekly digest.
- **Pro:** product-unlimited active links, 1,000 AI summaries, 1,000 Assistant
  credits, 10,000 combined API/MCP calls, 200 X imports, and 100 enriched X
  summaries each month.

“Weekly digest of what you read” is accepted marketing shorthand for a digest
selected from recently saved links. A generally larger Pro summary model is
planned work, not a current capability.

Monthly and annual paid intervals are supported. Marketing bullets are not an
authorization source; the server merges tier defaults with per-workspace
overrides at request/operation time.

## Trust Surfaces

The product publishes privacy, terms, contact, export, and account-deletion
surfaces. Link content is fetched to derive metadata and summaries; full fetched
pages are not retained in the workspace model. Basic link summaries use Workers
AI. Chat, eligible X enrichment, and weekly digest generation use
OpenRouter-hosted models. Public copy describes these providers and the
asynchronous deletion lifecycle without exposing internal model or workflow
details. Remaining retention and telemetry gaps are tracked in
[DELTA-013](../.delta/DELTA-013-activity-analytics-retain-content-after-deletion.md)
and [DELTA-016](../.delta/DELTA-016-telemetry-emits-raw-content-and-identifiers.md).

OneDollarStats runs across public and authenticated routes. Meta Pixel runs only
on the landing, login, contact, Terms, and Privacy routes, and its loader exits
before contacting Meta when the browser exposes Global Privacy Control.

## Brand Identity

The product mark is the Fan: nine hairline rays fanned 150° from a pivot
below the canvas, one flat color, never filled. The ray count never changes
with size. The mark renders black on light surfaces and white on inverse
surfaces; it is never tinted with the accent color. Stroke weight follows a
single rule (0.7px at 96px and above, scaling down sublinearly below) and
tiles center the mark on its stroke centroid rather than its bounding box.
The logo-plus-name lockup is a single shared treatment (20px mark, lowercase
wordmark) used identically on the app top bar, landing, footer, and login.
Loading and login surfaces animate the mark with the Unfold/Trace loop on
the app's shared motion curve. The spec constants live in
`src/lib/brand/fan.ts` (mirrored in the extension), and `bun run
brand:export` regenerates all raster brand assets from them. The prior
torus-knot mark and dithered backgrounds are fully retired. Rationale:
[.decisions/0002-adopt-fan-brand-mark.md](./.decisions/0002-adopt-fan-brand-mark.md).

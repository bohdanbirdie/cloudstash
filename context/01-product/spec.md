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
chat commits through its server-side LiveStore client.

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

- **Free:** saving core, Chrome capture, tags, archiving, search, sync, export.
- **Plus:** Free plus AI summaries, Telegram and Raycast integrations, weekly
  digest, and public API.
- **Pro:** Plus plus X bookmark sync/enrichment, chat agent, and MCP.

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

# Retrieval and Agent — Spec

This document specifies search, export, public reads, and chat. It builds on
[requirements.md](./requirements.md).

## Status

Active.

## Local Search

`searchLinks$` lowercases and splits the query into words. Each word must match
one of title, explicit/pending tag, domain, description, latest summary, or URL.
The score per matched word is:

| Field         | Weight |
| ------------- | -----: |
| title         |    100 |
| effective tag |     80 |
| domain        |     50 |
| description   |     30 |
| summary       |     20 |
| URL           |     10 |

Results exclude archived links, order by total score, and cap at 20. Status
views use dedicated local queries; multi-tag filters compare the count of
distinct effective matches with the selected tag count.

## Export

Current export is client-side and ungated. It can generate newline-separated
URLs or a Markdown document with title, URL, domain, status, saved/completed
dates, image, description, and AI summary for the selected/result links. It does
does not currently export whole-Vault scope or tags; the broader landing claim is tracked in
[DELTA-005](../../.delta/DELTA-005-export-claim-exceeds-current-export.md).

## Public Links API

`GET /api/links` authenticates a Bearer API key, resolves workspace metadata,
enforces `publicApi`, and validates `state`, `limit`, and cursor. Pages order by
`createdAt DESC, id DESC`; the cursor encodes the last `(createdAt, id)` pair as
opaque base64url. Responses include latest summary, metadata, processing status,
and merged explicit/pending tag names. The API reads through
`ChatAgentDO.listLinks`, which hosts a server-side workspace store.

## Remote MCP

`POST /mcp` is stateless and exposes only `search_links` and `save_link`.
Search reuses `searchLinks$` through a read-only `ChatAgentDO` RPC and returns up
to 20 relevance-ranked matches; save uses the intake Queue. Fresh server
instances serve MCP 2026 and the 2025 compatibility path. Each tool requires its
matching `links:read` or `links:write` scope.

## Chat Agent

One `ChatAgentDO` currently exists per workspace and extends Cloudflare
`AIChatAgent`. Agents SDK storage owns message history; the DO also hosts a
LiveStore client and monthly token-usage record.

The provider is OpenRouter with Google Gemini. The model sees a hardened system
prompt and at most the last 30 UI messages. A request is capped at five tool
steps. Input validation rejects common prompt-injection forms before provider
execution.

Tools list/search/get/save links, inspect counts, change completion, restore,
and archive one or many links. Archival tools stop for explicit client
confirmation. Tool execution queries or commits the workspace LiveStore
store. Link mentions/citations render from returned IDs.

Before a model call, the DO reads the workspace chat budget, reserves an
estimated token amount atomically in DO storage, and reconciles actual usage
after completion. Budget lookup fails closed; provider rate/credit/tool errors
map to concise user-facing messages. Chat is gated by the `chatAgent`
capability at connection/request hooks.

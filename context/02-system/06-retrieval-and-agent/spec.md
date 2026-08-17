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

`POST /mcp` is a stateless remote MCP endpoint. Its v1 surface contains exactly
`search_links` and `save_link`; it does not expose chat-agent mutation tools,
list/get/archive tools, resources, prompts, or server-side conversation state.
`search_links` requires a trimmed query of at most 200 characters and reuses the
existing `searchLinks$` ranking through a narrow read-only `ChatAgentDO` RPC. It
returns at most the top 20 matches, with no cursor or total. Results are ordered
by relevance score; ordering among equal scores is not a stable contract.

The endpoint serves the MCP 2026 per-request protocol and the 2025 stateless
compatibility flow from a fresh server instance per HTTP exchange. OAuth is
resource-bound and reauthorized at each request; `search_links` requires
`links:read` and `save_link` requires `links:write`.

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

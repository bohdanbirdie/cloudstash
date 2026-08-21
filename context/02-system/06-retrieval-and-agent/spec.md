# Retrieval and Agent — Spec

This document specifies search, export, public reads, and chat. It builds on
[requirements.md](./requirements.md).

## Status

Active.

## Local Search

`searchLinks$` lowercases and splits the query into terms. A result may match any
term in its title, explicit/pending tags, domain, description, latest summary,
or URL. Each matching term adds the field's weight. Server callers may request
`match=all` when every term must match instead:

| Field         | Weight |
| ------------- | -----: |
| title         |    100 |
| effective tag |     80 |
| domain        |     50 |
| description   |     30 |
| summary       |     20 |
| URL           |     10 |

Results default to active (non-archived) links, order by total score, and cap at 20. Server callers can also constrain state and saved-date range. Results
include the complete link record (including image URL) plus score and matched
fields. Status views use dedicated local queries; multi-tag filters compare the
count of distinct effective matches with the selected tag count.

## Export

Current export is client-side and ungated. It can generate newline-separated
URLs or a Markdown document with title, URL, domain, status, saved/completed
dates, image, description, and AI summary. The account-menu export covers the
current status view: All exports the full active Vault, while Archive exports
archived links separately. Per-link and multi-select exports use the same two
formats. Tags are not currently included.

## Public Links API

The links API authenticates a Bearer API key, resolves current workspace access,
and enforces `publicApi` on every request. `GET /api/links` lists or searches
with bounded state/date/sort filters; list pages use an opaque `(createdAt, id)`
cursor. `GET /api/links/:id`, `POST /api/links`, `PATCH /api/links/:id`, and
`POST /api/links/batch-update` provide get, save-with-tags, and bounded state/tag
updates. Explicit ID selectors cannot contain more entries than the requested
limit. URL/generated metadata and reprocessing are not mutable.

Collection state defaults to `active`, meaning inbox and completed links while
excluding archived ones. `archive` selects archived links and `any` selects full
history. The legacy `all` value remains an alias for `active`; it does not mean
full history.

REST and MCP call the workspace-named `LinkProcessorDO`, reusing its existing
LiveStore client. It returns complete link records, commits mutations, and waits
up to five seconds for SyncBackend durability. Tag reads are restricted to
returned link IDs. Its RPC boundary decodes exact Effect Schemas and exposes
domain failures as values while storage/sync failures reject.

## Remote MCP

`POST /mcp` remains stateless. Fresh server instances expose `list_links`,
`search_links`, `get_link`, `save_link`, `update_link`, and `update_links` for
MCP 2026 and the 2025 compatibility path. The operations and limits match the
links REST API, including ranked any-term search, optional all-term matching, and
collection-state semantics. Tool discovery publishes concrete JSON Schema types
usable by strict clients. No tool accepts reprocessing. Each request and tool
requires its matching `links:read` or `links:write` scope.

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

This change does not alter `ChatAgentDO` or its tools. The planned multi-chat
split will remove its LiveStore client and route aligned tools through the
LinkProcessorDO's link-operation RPCs.

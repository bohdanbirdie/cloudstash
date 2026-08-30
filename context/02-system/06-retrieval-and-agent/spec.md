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
current status view: All exports the full active library, while Archive exports
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

Each conversation is one named `ChatAgentDO` extending Cloudflare
`AIChatAgent`. Agents SDK storage owns that conversation's complete visible
message history. The original workspace-named actor remains the default
conversation, so existing histories require no migration. New conversations use
generated IDs, persist their validated workspace binding, and do not host a
LiveStore client.

The workspace-named `LinkProcessorDO` stores a bounded chat registry through its
own key-value storage API; this does not add a D1 table or a new external KV
binding. The registry contains only conversation ID, actor name, title, and
created/updated timestamps. The client preloads this metadata after entitlement
resolution. A page load starts on the conversation list; opening a conversation
connects to and loads messages from only that selected actor. Closing and
reopening the dock preserves its list-or-conversation view while the application
remains mounted. Unknown actor names are rejected against the registry before
connection.

Per [decision 0002](./.decisions/0002-pin-gpt-5-6-luna-for-chat.md), the
provider is OpenRouter with the pinned `openai/gpt-5.6-luna-20260709` model.
Chat, weekly digests, and X enrichment share one executable model constant. The
model sees a hardened system
prompt and at most the last 30 uncompacted UI messages. A request is capped at
five tool steps. Input validation rejects common prompt-injection forms before
provider execution.

Full visible history remains intact for the UI. When estimated pending context
crosses the compaction threshold, the chat privately summarizes the old prefix,
keeps a recent tail verbatim, stores only the rolling summary and boundary, and
injects that summary into later model context. Compaction is not rendered as a
user or assistant message. It uses the same pinned model, usage accounting, and
monthly Assistant allowance as the answer turn; a compaction failure is logged
and the answer continues with bounded recent context.

Tools list/search/get/save links, inspect counts, change completion, restore,
and archive one or many links. Recent-link reads accept saved-date bounds and
return saved timestamps so a period lookup does not fan out into per-link reads.
A shared Effect `RpcGroup` defines their schema, success, and typed-error
contract. Effect RPC runs over Cloudflare native Durable Object RPC and
delegates every library operation to the workspace-named `LinkProcessorDO`,
which owns the canonical server-side LiveStore replica. Link mentions/citations
render from returned IDs.

Archival tools declare AI SDK `needsApproval` on the server. Approval responses
use the SDK approval ID and denied calls never execute. The SDK queues approved
continuations back through `onChatMessage`, so capability and allowance checks
remain authoritative for the post-approval model turn.

Before every model call or tool continuation, the DO rechecks the workspace
`chatAgent` capability and reads settled monthly spend from the workspace
`LinkProcessorDO`. Completion appends one idempotent settlement using the actual
cost reported by OpenRouter and updates the monthly aggregate atomically.
Context compaction and the answer settle together. A private runtime limit maps
that aggregate to public credits without exposing provider-accounting
configuration. A run resolves one immutable allowance-window ID before provider
work and uses that same ID for settlement even if the reset boundary passes
during the run. Monthly Stripe plans use the subscription item's exact current
period; annual plans derive monthly subwindows from Stripe's billing anchor;
admin grants derive them from the grant anchor. Remaining credits and the reset date appear quietly below the
conversation list and in the Account usage section; neither surface exposes
provider costs or the private limit. The old token ledger is intentionally not
converted because a faithful conversion would require stale model pricing.

There is no in-flight reservation. Rare overlapping short calls can both pass
the preflight and settle slightly above the limit; this accepted tradeoff keeps
the path to one read RPC and one atomic settlement RPC per run. Missing provider
cost metadata is logged rather than estimated, and the shared provider account
cap remains the emergency backstop.
Capability denial and allowance lookup failure stop model and tool work;
provider rate/credit/tool errors map to concise user-facing messages. Initial
connection/request hooks also verify the session, current approval, and
membership. The current SDK turn callback does not expose the originating
connection identity, so established-connection approval/membership revocation
remains tracked in
[DELTA-042](../../.delta/DELTA-042-established-chat-connections-do-not-reauthorize.md).

Creating and deleting conversations updates the registry; deletion retires and
wipes only the selected chat actor, including when it is the final conversation.
An explicitly empty registry stays empty until the user creates a fresh chat.
Account deletion retires every registered chat before wiping the registry and
canonical LinkProcessor actor. The old destructive `/clear` command is removed
in favor of explicit conversation lifecycle.

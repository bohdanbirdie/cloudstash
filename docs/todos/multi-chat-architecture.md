# Multi-chat architecture

Today: one `ChatAgentDO` per workspace, single conversation. Goal: multiple named chats per workspace (ChatGPT-style threads) — create, switch, delete, rename. Some chats may be seeded with link context (e.g. "Ask AI about this link").

## Decision: separate DOs with central livestore DO

Two DO classes per workspace:

```
WorkspaceLivestoreDO  (1 per workspace)
  • holds the livestore client (materialized once)
  • holds the `chats` registry table (id, title, timestamps)
  • exposes @callable() RPCs:
      - tool RPCs (queryLinks, searchLinks, commitTagSuggestion, editLinkSummary, …)
      - chat lifecycle (createChat, deleteChat, renameChat)

ChatAgentDO  (1 per chat — name = chatId)
  • extends AIChatAgent — full conveniences preserved
  • holds messages, runs the LLM, owns its own SQLite
  • NO livestore client of its own
  • tools are thin wrappers that RPC into WorkspaceLivestoreDO via env binding
  • chat DO learns its workspace id from `${workspaceId}:${nanoid}` name encoding
```

Client:

- `useAgent({ agent: "workspace", name: workspaceId })` — chat list + create/delete RPCs
- `useAgent({ agent: "chat", name: chatId })` — active chat (works exactly like today)

## Why not facets

Considered the facet/sub-agent primitive (parent extends `Agent`, children extend `AIChatAgent`, `routeAgentRequest` handles `/agents/parent/{name}/sub/chat/{id}` URLs). Has built-in registry, lifecycle, routing — would save ~150 lines of glue.

Rejected because:

- **SDK churn.** 6 P0 facet bugs shipped in 12 days during research. 15+ `@experimental` markers. Type signatures of `subAgent`/`parentAgent` openly under reconsideration. Will eat at least one breaking change in 6 months.
- **Failure isolation.** Facet bug = entire chat surface broken until the SDK fix lands. Separate DOs = one chat-class bug hits one chat.
- **Binding-name footgun.** `ChatAgentDO` as both top-level binding AND facet child resolves to _different_ storage volumes — confusing migration.
- **Migration is harder.** Facet storage isn't externally writable; have to spawn the facet then RPC into it. Plus known message-ID dedup corruption (#1465) when copying messages.
- **Cloudstash already speaks DO-DO RPC.** `SyncBackendDO ↔ LinkProcessorDO` pattern is in the codebase.

The `Chats` base class + `useChats()` hook on the Project Think roadmap (cloudflare/agents#1439, Track 2) will eventually make facets the no-hassle option. Until that ships, separate DOs are the lower-risk path.

## Open architectural decisions

- **Parent serialization.** All chats' tool calls hit one `WorkspaceLivestoreDO` (single-threaded). At cloudstash's "one user per workspace" concurrency this is fine; if multi-user-per-workspace ever happens, revisit.
- **Co-location.** Cloudflare doesn't guarantee chat DOs land in the same colo as the livestore DO. Practically they do for the same workspace, but it's not contractual. Cross-colo RPC = 50–200ms vs. 1–5ms intra-colo.
- **Workspace-id encoding in chat name.** Use `${workspaceId}:${nanoid}` so chat DOs can resolve their parent without extra storage. Alternative: persist on first connect.
- **Chat lifecycle.** v1: explicit user delete only. No TTL. Add cap (max N chats per workspace, FIFO eviction) later if storage grows.

## Migration

- Wipe existing chat history. Agent is feature-flagged; no production users depend on continuity.
- One new wrangler entry for `WorkspaceLivestoreDO` (new SQLite class).
- Rename `ChatAgentDO` binding name from `workspaceId` to `chatId`. The class stays; its semantics change (no livestore, parent-id derived from name).
- Move `usage.ts` / `broadcastUsage()` / token budget tracking onto `WorkspaceLivestoreDO` — usage is per-workspace, not per-chat. Chat DO RPCs into parent on each turn finish.

## Cost notes

Init cost per fresh `ChatAgentDO`: ~14 tables + ~5 indexes + 1 schema-version row. ~20 rows written. At $1/M rows written with 50M/month included on paid plan: $0.00002 per chat creation, or 2.5M new chats/month within free tier. Genuinely negligible.

Real costs scale with usage (DO duration during streaming, message storage growth), not with chat count.

## Files this will touch

- `src/cf-worker/chat-agent/index.ts` — strip livestore client, take workspace id from name, replace tool wiring with parent RPC stubs
- `src/cf-worker/chat-agent/tools.ts` — tools become RPC calls
- `src/cf-worker/chat-agent/usage.ts` — move to workspace DO
- New: `src/cf-worker/workspace-agent/` — the parent DO + livestore + chats registry
- `wrangler.toml` — new DO class binding, migration entry
- `src/components/agent/agent-chat-provider.tsx` — `chatId` parameter, two `useAgent` hooks
- New: chat-list UI (sidebar / panel — design call)

## Triggers to revisit before implementing

- If `Chats` base class lands in `agents` SDK, reassess vs. facets — it would collapse most of the new DO into ~10 lines + a hook.
- If multi-user-per-workspace becomes a thing, revisit parent serialization.

Pulled from extended design discussion. Not blocked on anything; ship when there's a product appetite for the chat-list UX.

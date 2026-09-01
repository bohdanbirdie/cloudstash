# Chat Agent

AI chat for managing links via natural language, built on Cloudflare Agents SDK.

## Overview

Multiple chats per workspace with real-time WebSockets, isolated message
persistence in each conversation DO, and Effect RPC access to the canonical
link library. The lightweight session registry and library-wide Assistant usage
ledger live in `LinkProcessorDO`; listing sessions does not materialize chat
content. Uses the pinned OpenRouter model `openai/gpt-5.6-luna-20260709` via
Vercel AI SDK. Chat, weekly digests, and X enrichment share one
`OPENROUTER_MODEL_ID`.

## Architecture

```
Frontend                          Backend
─────────                         ───────
useAgent({ agent: "chat",        Worker: routeAgentRequest()
  name: conversationId })           → env.Chat binding
useAgentChat({ agent,               → /agents/chat/{conversationId}
  credentials: "include" })
                                  ChatAgentDO extends AIChatAgent
                                    onChatMessage() → streamText()
                                    with tools + LinkProcessor Effect RPC
```

## Tools

| Tool              | Description                  | Auto/HITL |
| ----------------- | ---------------------------- | --------- |
| `listRecentLinks` | List recently saved links    | Auto      |
| `saveLink`        | Save a new URL               | Auto      |
| `searchLinks`     | Search by keyword            | Auto      |
| `getLink`         | Get link details by ID       | Auto      |
| `completeLink`    | Mark as done                 | Auto      |
| `uncompleteLink`  | Mark as unread               | Auto      |
| `deleteLink`      | Archive a link               | **HITL**  |
| `restoreLink`     | Restore an archived link     | Auto      |
| `completeLinks`   | Bulk mark as done            | Auto      |
| `deleteLinks`     | Archive links in bulk        | **HITL**  |
| `getInboxLinks`   | List unread links            | Auto      |
| `getStats`        | Inbox/completed/total counts | Auto      |

Archival tools declare `needsApproval: true` and keep their executor on the
server. The frontend responds with `addToolApprovalResponse()`; approved calls
execute through the canonical LinkProcessor Effect RPC, while denied calls do
not execute.

## Authentication & Feature Gating

Auth hooks in `src/cf-worker/agents/hooks.ts` run before connect/request:

1. Validate session cookie via `checkSyncAuth`
2. Check `chatAgentEnabled` feature flag on org

Frontend gates the Chat sidebar button on `useOrgFeatures().isChatEnabled`. Admin can toggle per workspace.

## Key Implementation Details

**Agent naming:** `useAgent({ agent: "chat" })` maps to binding `Chat` (kebab-case → PascalCase). Using `agent: "ChatAgentDO"` would produce wrong URL.

**Lazy connection:** `ChatContent` only mounts when dialog opens → no WebSocket on page load. Wrapped in `<Suspense>` because `useAgentChat` uses React `use()` internally.

**Connection state:** Track via `onOpen`/`onClose` callbacks, not `agent.readyState` (doesn't trigger re-renders).

**Context window:** Full history remains in SQLite for UI display. The model
receives a bounded recent tail plus a private rolling summary of older context.
Conversation deletion replaces the removed `/clear` command.

**Assets routing:** `/agents/*` must be in `run_worker_first` in wrangler.toml, otherwise SPA returns `index.html`.

## Guardrails

- **Input validation** (`input-validator.ts`) — 33 regex patterns detect prompt injection attempts before they reach the model
- **Hardened system prompt** — explicit role boundaries, refusal instructions
- **Step limit** — max 5 tool-call rounds per request

## Slash Commands

`/help`, `/clear`, `/search <query>`, `/save <url>`, `/recent [n]` — bypass LLM for quick actions.

# Chat Agent

AI chat for managing links via natural language, built on Cloudflare Agents SDK.

## Overview

One chat per workspace with real-time WebSocket, message persistence in DO SQLite, and LiveStore integration for link management. Uses OpenRouter (`google/gemini-2.5-flash`) via Vercel AI SDK.

## Architecture

```
Frontend                          Backend
─────────                         ───────
useAgent({ agent: "chat",        Worker: routeAgentRequest()
  name: workspaceId })              → env.Chat binding
useAgentChat({ agent,               → /agents/chat/{workspaceId}
  credentials: "include" })
                                  ChatAgentDO extends AIChatAgent
                                    onChatMessage() → streamText()
                                    with tools + LiveStore store
```

## Tools

| Tool | Description | Auto/HITL |
|---|---|---|
| `listRecentLinks` | List recently saved links | Auto |
| `saveLink` | Save a new URL | Auto |
| `searchLinks` | Search by keyword | Auto |
| `getLink` | Get link details by ID | Auto |
| `completeLink` | Mark as done | Auto |
| `uncompleteLink` | Mark as unread | Auto |
| `deleteLink` | Move to trash | **HITL** |
| `restoreLink` | Restore from trash | Auto |
| `completeLinks` | Bulk mark as done | Auto |
| `deleteLinks` | Bulk move to trash | **HITL** |
| `getInboxLinks` | List unread links | Auto |
| `getStats` | Inbox/completed/total counts | Auto |

HITL tools have no `execute` function → AI SDK stops, frontend shows confirmation UI, `addToolResult()` sends approval back, `processToolCalls()` executes server-side.

## Authentication & Feature Gating

Auth hooks in `src/cf-worker/agents/hooks.ts` run before connect/request:
1. Validate session cookie via `checkSyncAuth`
2. Check `chatAgentEnabled` feature flag on org

Frontend gates the Chat sidebar button on `useOrgFeatures().isChatEnabled`. Admin can toggle per workspace.

## Key Implementation Details

**Agent naming:** `useAgent({ agent: "chat" })` maps to binding `Chat` (kebab-case → PascalCase). Using `agent: "ChatAgentDO"` would produce wrong URL.

**Lazy connection:** `ChatContent` only mounts when dialog opens → no WebSocket on page load. Wrapped in `<Suspense>` because `useAgentChat` uses React `use()` internally.

**Connection state:** Track via `onOpen`/`onClose` callbacks, not `agent.readyState` (doesn't trigger re-renders).

**Context window:** Full history in SQLite for UI display, but only last 30 messages sent to model. `/clear` resets conversation.

**Assets routing:** `/agents/*` must be in `run_worker_first` in wrangler.toml, otherwise SPA returns `index.html`.

## Guardrails

- **Input validation** (`input-validator.ts`) — 33 regex patterns detect prompt injection attempts before they reach the model
- **Hardened system prompt** — explicit role boundaries, refusal instructions
- **Step limit** — max 5 tool-call rounds per request

## Slash Commands

`/help`, `/clear`, `/search <query>`, `/save <url>`, `/recent [n]` — bypass LLM for quick actions.

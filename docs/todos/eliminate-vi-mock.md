# Eliminate vi.mock from test suite

Two test files still use `vi.mock`:

## 1. `tools.test.ts` — livestore Store mocking

Extract a `ToolDeps` interface for what tools actually need (query functions, commitEvent, generateId). Change `createTools(store)` → `createTools(deps)`. Tests provide plain mock functions.

Files: `src/cf-worker/chat-agent/tools.ts`, `index.ts`, `__tests__/unit/tools.test.ts`

## 2. `tool-utils.test.ts` — AI SDK utility mocking

Make `getToolName`/`isToolUIPart` injectable via parameter object with defaults importing from `"ai"`. Tests pass mock implementations directly.

Files: `src/cf-worker/chat-agent/utils.ts`, `__tests__/unit/tool-utils.test.ts`

Plain parameter injection, not Effect DI — these aren't Effect programs.

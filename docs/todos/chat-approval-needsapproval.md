# Migrate chat tool approval to server-side `needsApproval`

`@cloudflare/ai-chat` deprecated the client-side `toolsRequiringConfirmation`
option in 0.7.x. The replacement is server-side `needsApproval` on tool
definitions, with the SDK driving the `approval-requested` part state and
`addToolApprovalResponse` on the client.

Surfaced during the 2026-06-07 dependency audit (`@cloudflare/ai-chat` 0.6.2 → 0.7.2). Not urgent — it's deprecation cleanup, not a breakage.

## Replaced architecture (custom human-in-the-loop)

Only two tools need confirmation: `deleteLink`, `deleteLinks`.

- `chat-agent/tools.ts` — confirmation tools are defined **without** `execute` (so the model pauses), and a parallel `createToolExecutors` holds their real logic.
- `chat-agent/index.ts#onChatMessage` — checks `hasToolConfirmation(lastMessage)`; if the last message carries an `APPROVAL.YES/NO` output for a confirmation tool, routes to `handleToolConfirmation`, which runs `processToolCalls` to execute the approved executor, replaces the tool output, then re-streams.
- `chat-agent/utils.ts` — `APPROVAL`, `processToolCalls`, `processToolPart`, `hasToolConfirmation`, `isApprovalOutput` (custom Effect pipeline).
- `shared/tool-config.ts` — `TOOLS_REQUIRING_CONFIRMATION` / `requiresConfirmation`.
- `components/agent/agent-chat-provider.tsx` — passes `toolsRequiringConfirmation`, exposes `addToolOutput`.
- `components/agent/agent-messages.tsx` — approve/reject call `addToolOutput({ output: APPROVAL.YES/NO })`.
- `components/ui/tool.tsx` — renders approve/reject buttons by inferring "pending" from an absent output.
- `__tests__/unit/tool-utils.test.ts` (353 lines) — exhaustively tests the custom pipeline.

## Implemented target (`needsApproval`)

Confirmed in installed `@cloudflare/ai-chat@0.7.2`: AI SDK `tool()` accepts
`needsApproval`; the hook exposes `approval-requested` tool parts and
`addToolApprovalResponse` over a `CF_AGENT_TOOL_APPROVAL` message.

- `tools.ts` — give `deleteLink`/`deleteLinks` an `execute` (fold in the executor logic) + `needsApproval: true`. Delete `createToolExecutors`.
- `utils.ts` — delete the approval pipeline (most of the file).
- `index.ts` — drop the `hasToolConfirmation` branch + `handleToolConfirmation`; `onChatMessage` collapses to one path.
- `shared/tool-config.ts` — removable.
- `agent-chat-provider.tsx` — drop `toolsRequiringConfirmation`; expose `addToolApprovalResponse`.
- `agent-messages.tsx` — approve/reject → `addToolApprovalResponse({ toolCallId, approved })`.
- `tool.tsx` — render buttons on the `"waiting-approval"` state via `getToolApproval`.
- `tool-utils.test.ts` — delete/rewrite (the logic it tests is gone); shift coverage to e2e.

Net effect: deletes ~150 lines of custom approval plumbing + a 353-line test. Touches ~7 files across server/client/shared/tests.

## Token-budget continuation

The installed SDK applies the approval, queues auto-continuation through its
exclusive turn queue, and calls `onChatMessage(..., { continuation: true })`.
Therefore the existing capability and settled-spend checks run again before the
post-approval model turn; continuation does not bypass metering.

## Verification

- Real-DO E2E proves the approved destructive executor uses the canonical
  LinkProcessor RPC and changes state.
- Manual browser verification covers both approve and reject rendering and
  continuation behavior.
- Focused unit coverage asserts both destructive tools require server approval.

## Estimate

A few hours, dominated by the `tool.tsx` state-machine rewrite and the usage-accounting verification.

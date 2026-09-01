import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";

import {
  hasPendingToolApproval,
  isAgentChatBusy,
} from "@/components/agent/agent-chat-provider";

describe("isAgentChatBusy", () => {
  it.each([
    ["submitted", false, false],
    ["ready", true, false],
    ["ready", false, true],
  ] as const)(
    "blocks input for status=%s streaming=%s continuation=%s",
    (status, isStreaming, isToolContinuation) => {
      expect(isAgentChatBusy({ status, isStreaming, isToolContinuation })).toBe(
        true
      );
    }
  );

  it("allows input when the turn is idle", () => {
    expect(
      isAgentChatBusy({
        status: "ready",
        isStreaming: false,
        isToolContinuation: false,
      })
    ).toBe(false);
  });
});

describe("hasPendingToolApproval", () => {
  const pendingMessages = [
    {
      id: "assistant-pending",
      role: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolName: "deleteLink",
          toolCallId: "delete-link-1",
          state: "approval-requested",
          input: { id: "link-1" },
          approval: { id: "approval-1" },
        },
      ],
    },
  ] satisfies UIMessage[];

  const completedMessages = [
    {
      id: "assistant-completed",
      role: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolName: "deleteLink",
          toolCallId: "delete-link-1",
          state: "output-available",
          input: { id: "link-1" },
          output: { success: true },
        },
      ],
    },
  ] satisfies UIMessage[];

  it("reports an unanswered tool approval", () => {
    expect(hasPendingToolApproval(pendingMessages)).toBe(true);
  });

  it("stops reporting attention after the tool settles", () => {
    expect(hasPendingToolApproval(completedMessages)).toBe(false);
  });
});

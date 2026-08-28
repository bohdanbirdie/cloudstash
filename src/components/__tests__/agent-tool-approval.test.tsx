// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { UIMessage } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const addToolApprovalResponse = vi.hoisted(() => vi.fn());

const messages: UIMessage[] = [
  {
    id: "assistant-1",
    role: "assistant",
    parts: [
      {
        type: "dynamic-tool",
        toolName: "destructiveAction",
        toolCallId: "tool-call-1",
        state: "approval-requested",
        input: {},
        approval: { id: "approval-1" },
      },
    ],
  },
];

vi.mock("@/components/agent/agent-chat-provider", () => ({
  useAgentChat: () => ({
    messages,
    status: "ready",
    isBusy: false,
    error: undefined,
    addToolApprovalResponse,
  }),
}));

import { AgentMessages } from "@/components/agent/agent-messages";

describe("agent tool approval", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  });

  afterEach(() => {
    cleanup();
    addToolApprovalResponse.mockReset();
    vi.unstubAllGlobals();
  });

  it("forwards the approval id and exact approve or reject decision", () => {
    render(<AgentMessages />);

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(addToolApprovalResponse.mock.calls).toEqual([
      [{ id: "approval-1", approved: true }],
      [{ id: "approval-1", approved: false }],
    ]);
  });
});

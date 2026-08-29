// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

import {
  AgentMessages,
  AgentMessagesView,
} from "@/components/agent/agent-messages";
import { LinkDeleteConfirmationView } from "@/components/chat/link-delete-confirmation";

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

    fireEvent.click(
      screen.getByRole("button", { name: "Allow destructive action" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(addToolApprovalResponse.mock.calls).toEqual([
      [{ id: "approval-1", approved: true }],
      [{ id: "approval-1", approved: false }],
    ]);
  });

  it("collapses concurrent work into one customer-facing activity", async () => {
    render(
      <AgentMessagesView
        messages={[
          {
            id: "assistant-working",
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                toolName: "searchLinks",
                toolCallId: "searching",
                state: "input-available",
                input: { query: "Lisbon" },
              },
              {
                type: "dynamic-tool",
                toolName: "saveLink",
                toolCallId: "saving",
                state: "input-streaming",
                input: { url: "https://example.com" },
              },
            ],
          },
        ]}
        status="streaming"
        isBusy
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByRole("status")).toHaveLength(1);
    });
    expect(screen.getByRole("status").textContent).toContain("Saving the link");
    expect(screen.queryByText("Searching your library")).toBeNull();
  });

  it("keeps sequential work in one live activity until it settles", async () => {
    render(
      <AgentMessagesView
        messages={[
          {
            id: "assistant-working",
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                toolName: "searchLinks",
                toolCallId: "completed-search",
                state: "output-available",
                input: { query: "Lisbon" },
                output: { total: 1 },
              },
              {
                type: "dynamic-tool",
                toolName: "getLink",
                toolCallId: "opening-link",
                state: "input-available",
                input: { id: "lisbon" },
              },
            ],
          },
        ]}
        status="streaming"
        isBusy
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByRole("status")).toHaveLength(1);
    });
    expect(screen.getByRole("status").textContent).toContain(
      "Opening link details"
    );
    expect(screen.queryByText("Searched your library")).toBeNull();
  });

  it("settles sequential tools into one expandable action summary", () => {
    render(
      <AgentMessagesView
        messages={[
          {
            id: "assistant-complete",
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                toolName: "searchLinks",
                toolCallId: "completed-search",
                state: "output-available",
                input: { query: "private-query" },
                output: { internalDatabaseId: "technical-output" },
              },
              {
                type: "dynamic-tool",
                toolName: "getLink",
                toolCallId: "completed-link",
                state: "output-available",
                input: { id: "private-id" },
                output: { internalContent: "technical-content" },
              },
            ],
          },
        ]}
        status="ready"
        isBusy={false}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    const summary = screen.getByRole("button", {
      name: "Searched your library · 1 more",
    });
    expect(screen.queryByText("Opened link details")).toBeNull();

    fireEvent.click(summary);

    expect(screen.getByText("Searched your library")).not.toBeNull();
    expect(screen.getByText("Opened link details")).not.toBeNull();
    expect(screen.queryByText(/private-query/)).toBeNull();
    expect(screen.queryByText(/technical-content/)).toBeNull();
  });

  it("groups only consecutive runs of the same tool", () => {
    const completedTool = (toolName: string, toolCallId: string) => ({
      type: "dynamic-tool" as const,
      toolName,
      toolCallId,
      state: "output-available" as const,
      input: {},
      output: {},
    });

    render(
      <AgentMessagesView
        messages={[
          {
            id: "assistant-grouped-tools",
            role: "assistant",
            parts: [
              completedTool("listRecentLinks", "recent"),
              completedTool("getLink", "open-1"),
              completedTool("getLink", "open-2"),
              completedTool("getLink", "open-3"),
              completedTool("searchLinks", "search"),
              completedTool("getLink", "open-4"),
              completedTool("getLink", "open-5"),
            ],
          },
        ]}
        status="ready"
        isBusy={false}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Checked recent links · 6 more" })
    );

    expect(screen.getByText("Opened link details · 3")).not.toBeNull();
    expect(screen.getByText("Opened link details · 2")).not.toBeNull();
    expect(screen.getAllByText(/Opened link details/)).toHaveLength(2);
  });

  it("keeps tool implementation details out of the transcript", () => {
    render(
      <AgentMessagesView
        messages={[
          {
            id: "assistant-complete",
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                toolName: "searchLinks",
                toolCallId: "complete-search",
                state: "output-available",
                input: { query: "private-query" },
                output: { internalDatabaseId: "technical-output" },
              },
            ],
          },
        ]}
        status="ready"
        isBusy={false}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.queryByText(/private-query/)).toBeNull();
    expect(screen.queryByText(/technical-output/)).toBeNull();
  });

  it("replaces raw tool errors with safe recovery copy", () => {
    render(
      <AgentMessagesView
        messages={[
          {
            id: "assistant-error",
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                toolName: "getLink",
                toolCallId: "failed-link",
                state: "output-error",
                input: { id: "missing" },
                errorText: "database shard 7 exploded",
              },
            ],
          },
        ]}
        status="ready"
        isBusy={false}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "Couldn’t check your library. Please try again."
    );
    expect(screen.queryByText(/shard 7/)).toBeNull();
  });

  it("keeps a compact receipt after an approved archive action completes", () => {
    render(
      <AgentMessagesView
        messages={[
          {
            id: "archive-complete",
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                toolName: "deleteLinks",
                toolCallId: "archive-complete",
                state: "output-available",
                input: { ids: ["link-1", "link-2"] },
                output: { updated: 2 },
              },
            ],
          },
        ]}
        status="ready"
        isBusy={false}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.getByRole("status").textContent).toBe(
      "Moved 2 links to archive"
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps large archive confirmations compact until expanded", () => {
    const links = Array.from({ length: 20 }, (_, index) => ({
      id: `link-${index + 1}`,
      title: `Saved link ${index + 1}`,
      domain: "example.com",
      favicon: null,
    }));

    render(
      <LinkDeleteConfirmationView
        links={links}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.getByText("Saved link 3")).not.toBeNull();
    expect(screen.queryByText("Saved link 4")).toBeNull();
    expect(screen.queryByText("Saved link 20")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show all 20 links" }));

    expect(screen.getByText("Saved link 20")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Show fewer links" })
    ).not.toBeNull();
  });
});

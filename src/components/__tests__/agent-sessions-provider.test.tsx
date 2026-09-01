// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentSessionListView } from "@/components/agent/agent-session-list";
import {
  AgentSessionsProvider,
  useAgentSessions,
} from "@/components/agent/agent-sessions-provider";

const SESSION_FIXTURES = [
  {
    id: "lisbon",
    agentName: "lisbon",
    title: "Weekend in Lisbon",
    createdAt: "2026-08-29T08:00:00.000Z",
    updatedAt: "2026-08-29T09:30:00.000Z",
  },
] as const;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("agent session navigation", () => {
  it("starts on the list and retains an opened session while the surface is hidden", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ sessions: SESSION_FIXTURES }),
      }))
    );

    render(<ProviderHarness />);

    await waitFor(() => expect(screen.getByText("List view")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Open first chat" }));
    expect(screen.getByText("Weekend in Lisbon")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close surface" }));
    expect(screen.queryByText("Weekend in Lisbon")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open surface" }));
    expect(screen.getByText("Weekend in Lisbon")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back to list" }));
    expect(screen.getByText("List view")).toBeTruthy();
  });

  it("offers one new-chat action when the session list is empty", () => {
    render(
      <AgentSessionListView
        sessions={[]}
        onSelect={vi.fn()}
        onCreate={vi.fn(async () => {})}
        onDelete={vi.fn(async () => {})}
        onOpenUsage={vi.fn()}
        onRetry={vi.fn(async () => {})}
      />
    );

    expect(screen.getAllByRole("button", { name: "New chat" })).toHaveLength(1);
  });

  it("lets the user retry a failed session-list request", async () => {
    const onRetry = vi.fn(async () => {});

    render(
      <AgentSessionListView
        sessions={[]}
        error={new Error("Session registry unavailable")}
        onSelect={vi.fn()}
        onCreate={vi.fn(async () => {})}
        onDelete={vi.fn(async () => {})}
        onOpenUsage={vi.fn()}
        onRetry={onRetry}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onRetry).toHaveBeenCalledOnce());
  });

  it("shows remaining Assistant credits without provider-cost details", () => {
    const onOpenUsage = vi.fn();
    render(
      <AgentSessionListView
        sessions={SESSION_FIXTURES}
        assistantCredits={{
          limit: 1_000,
          remaining: 842,
          resetsAt: "2026-09-01T00:00:00.000Z",
        }}
        onSelect={vi.fn()}
        onCreate={vi.fn(async () => {})}
        onDelete={vi.fn(async () => {})}
        onOpenUsage={onOpenUsage}
        onRetry={vi.fn(async () => {})}
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "842 of 1,000 Assistant credits left. Open usage settings.",
      })
    );
    expect(screen.getByText("842 / 1,000 credits left")).toBeTruthy();
    expect(onOpenUsage).toHaveBeenCalledOnce();
    expect(screen.queryByText(/\$/)).toBeNull();
  });
});

function ProviderHarness() {
  const [open, setOpen] = useState(true);

  return (
    <SWRConfig value={{ provider: () => new Map() }}>
      <AgentSessionsProvider workspaceId="workspace" enabled>
        <button type="button" onClick={() => setOpen((current) => !current)}>
          {open ? "Close surface" : "Open surface"}
        </button>
        {open && <SessionProbe />}
      </AgentSessionsProvider>
    </SWRConfig>
  );
}

function SessionProbe() {
  const { sessions, selectedSession, selectSession, showSessionList } =
    useAgentSessions();

  if (!selectedSession) {
    return (
      <div>
        <span>List view</span>
        <button
          type="button"
          disabled={!sessions[0]}
          onClick={() => sessions[0] && selectSession(sessions[0].agentName)}
        >
          Open first chat
        </button>
      </div>
    );
  }

  return (
    <div>
      <span>{selectedSession.title}</span>
      <button type="button" onClick={showSessionList}>
        Back to list
      </button>
    </div>
  );
}

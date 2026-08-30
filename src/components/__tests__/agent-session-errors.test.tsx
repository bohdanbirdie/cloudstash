// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AgentSessionsProvider,
  useAgentSessions,
} from "@/components/agent/agent-sessions-provider";

// Regression: FE-08-B.
//
// chat-agent/sessions-handler.ts returns a specific, actionable 409 when a
// workspace is at its chat limit — it tells the user to delete a chat first.
// agent-sessions-provider.tsx throws away the response body and raises
// `Create chat failed: 409`, so agent-session-list.tsx can only show its one
// static toast: "Couldn't update chats. Try again." Retrying fails
// identically, and every user who hits the limit sees it.

const LIMIT_MESSAGE =
  "A library can keep up to 50 chats. Delete one before starting another.";

function CreateProbe() {
  const { createSession } = useAgentSessions();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    createSession().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : String(error));
    });
  }, [createSession]);

  return <div data-testid="error">{message ?? "pending"}</div>;
}

const renderProbe = () =>
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <AgentSessionsProvider workspaceId="workspace" enabled>
        <CreateProbe />
      </AgentSessionsProvider>
    </SWRConfig>
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("chat session creation failures", () => {
  it("surfaces the server's message when the chat limit is reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          return {
            ok: false,
            status: 409,
            json: async () => ({ error: LIMIT_MESSAGE }),
          };
        }
        return { ok: true, json: async () => ({ sessions: [] }) };
      })
    );

    renderProbe();

    await waitFor(() =>
      expect(screen.getByTestId("error").textContent).not.toBe("pending")
    );

    expect(screen.getByTestId("error").textContent).toBe(LIMIT_MESSAGE);
  });

  it("falls back to a generic message when the body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          return {
            ok: false,
            status: 500,
            json: async () => {
              throw new Error("not json");
            },
          };
        }
        return { ok: true, json: async () => ({ sessions: [] }) };
      })
    );

    renderProbe();

    await waitFor(() =>
      expect(screen.getByTestId("error").textContent).not.toBe("pending")
    );

    expect(screen.getByTestId("error").textContent).toContain("500");
  });
});

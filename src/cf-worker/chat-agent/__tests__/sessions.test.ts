import { describe, expect, it, vi } from "vitest";

import type { ChatSession } from "../sessions";
import { retireRegisteredChatSession } from "../sessions";

const session: ChatSession = {
  id: "session-1",
  agentName: "agent-1",
  title: "New chat",
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
};

describe("retireRegisteredChatSession", () => {
  it("keeps the registry entry when retirement fails so retry can finish", async () => {
    let sessions: readonly ChatSession[] = [session];
    const retire = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("temporary retirement failure"))
      .mockResolvedValueOnce();
    const remove = vi.fn(async () => {
      sessions = [];
      return { ok: true, sessions } as const;
    });
    const operations = {
      read: async () => sessions,
      retire,
      remove,
    };

    await expect(
      retireRegisteredChatSession(session.agentName, operations)
    ).rejects.toThrow("temporary retirement failure");
    expect(sessions).toEqual([session]);
    expect(remove).not.toHaveBeenCalled();

    await expect(
      retireRegisteredChatSession(session.agentName, operations)
    ).resolves.toEqual({ ok: true, sessions: [] });
    expect(retire).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

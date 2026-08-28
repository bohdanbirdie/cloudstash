import { describe, expect, it } from "vitest";

import { isAgentChatBusy } from "@/components/agent/agent-chat-provider";

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

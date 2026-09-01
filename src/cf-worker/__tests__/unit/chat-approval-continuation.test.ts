import { AutoContinuationController, ContinuationState } from "agents/chat";
import type { AutoContinuationHost, ChatConnection } from "agents/chat";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.useRealTimers();
});

describe("chat approval continuation", () => {
  it("waits for every tool in an approval batch before continuing", async () => {
    vi.useFakeTimers();

    let hasIncompleteToolBatch = true;
    const fire = vi.fn();
    const connection: ChatConnection = {
      id: "connection-1",
      send: vi.fn(),
    };
    const host: AutoContinuationHost = {
      continuation: new ContinuationState(),
      generateRequestId: () => "continuation-1",
      isStreamActive: () => false,
      hasPendingInteraction: () => false,
      hasIncompleteToolBatch: () => hasIncompleteToolBatch,
      drainInteractionApplies: () => Promise.resolve(),
      keepAliveWhile: (effect) => effect(),
      fire,
    };
    const controller = new AutoContinuationController(host);

    controller.schedule({
      connection,
      clientTools: undefined,
      body: undefined,
      errorPrefix: "Tool continuation failed",
    });
    await vi.advanceTimersByTimeAsync(AutoContinuationController.COALESCE_MS);

    expect(fire).not.toHaveBeenCalled();
    expect(host.continuation.pending).not.toBeNull();

    hasIncompleteToolBatch = false;
    controller.rearmForBatch();
    await vi.advanceTimersByTimeAsync(AutoContinuationController.COALESCE_MS);

    expect(fire).toHaveBeenCalledOnce();
  });
});

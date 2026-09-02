import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";

import {
  COMPACTION_TAIL_MESSAGES,
  messagesAfterSummary,
  planChatCompaction,
  systemPromptWithSummary,
} from "../compaction";

const message = (id: string, text: string): UIMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
});

describe("chat context compaction", () => {
  it("does nothing while the working context is small", () => {
    expect(
      planChatCompaction([message("one", "hello")], undefined)
    ).toBeUndefined();
  });

  it("summarizes the old prefix while preserving a verbatim recent tail", () => {
    const messages = Array.from({ length: 20 }, (_, index) =>
      message(`message-${index}`, "context ".repeat(700))
    );
    const plan = planChatCompaction(messages, undefined);

    expect(plan).toBeDefined();
    if (!plan) throw new Error("Expected a compaction plan");
    expect(plan.recentMessages).toHaveLength(COMPACTION_TAIL_MESSAGES);
    expect(plan.messagesToSummarize.at(-1)?.id).toBe(plan.throughMessageId);
    expect(plan.recentMessages[0]?.id).toBe("message-8");
  });

  it("compacts many short messages after the 150-message window", () => {
    const messages = Array.from({ length: 151 }, (_, index) =>
      message(`message-${index}`, "short context")
    );
    const plan = planChatCompaction(messages, undefined);

    expect(plan).toBeDefined();
    expect(plan?.recentMessages).toHaveLength(COMPACTION_TAIL_MESSAGES);
    expect(plan?.messagesToSummarize).toHaveLength(
      151 - COMPACTION_TAIL_MESSAGES
    );
  });

  it("does not compact 150 short messages", () => {
    const messages = Array.from({ length: 150 }, (_, index) =>
      message(`message-${index}`, "short context")
    );

    expect(planChatCompaction(messages, undefined)).toBeUndefined();
  });

  it("uses a stored summary only as private model context", () => {
    const messages = [
      message("old", "old request"),
      message("recent", "current request"),
    ];
    const summary = {
      summary: "The user prefers short answers.",
      throughMessageId: "old",
      updatedAt: "2026-08-29T00:00:00.000Z",
    };

    expect(messagesAfterSummary(messages, summary)).toEqual([messages[1]]);
    expect(systemPromptWithSummary("Base prompt", summary)).toContain(
      "Earlier conversation context:\nThe user prefers short answers."
    );
  });
});

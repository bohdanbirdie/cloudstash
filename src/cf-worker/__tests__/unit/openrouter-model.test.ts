import { describe, expect, it } from "vitest";

import {
  OPENROUTER_REASONING_EFFORT,
  openRouterChatSettings,
} from "../../openrouter-model";

describe("OpenRouter workload configuration", () => {
  it("sets reasoning effort explicitly for every production workload", () => {
    expect(OPENROUTER_REASONING_EFFORT).toEqual({
      assistant: "low",
      compaction: "none",
      weeklyDigest: "none",
      xEnrichment: "none",
    });
  });

  it("keeps one opaque provider session stable across chat workloads", () => {
    expect(openRouterChatSettings("do-id", "assistant")).toEqual({
      extraBody: { session_id: "cloudstash-chat:do-id" },
      reasoning: { effort: "low" },
      usage: { include: true },
    });
    expect(openRouterChatSettings("do-id", "compaction")).toEqual({
      extraBody: { session_id: "cloudstash-chat:do-id" },
      reasoning: { effort: "none" },
      usage: { include: true },
    });
  });
});

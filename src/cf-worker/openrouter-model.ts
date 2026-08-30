/** One pinned model for every production feature that runs through OpenRouter. */
export const OPENROUTER_MODEL_ID = "openai/gpt-5.6-luna-20260709";

export const OPENROUTER_REASONING_EFFORT = {
  assistant: "low",
  compaction: "none",
  weeklyDigest: "none",
  xEnrichment: "none",
} as const;

type ChatModelWorkload = "assistant" | "compaction";

export const openRouterChatSettings = (
  sessionId: string,
  workload: ChatModelWorkload
) => ({
  extraBody: { session_id: `cloudstash-chat:${sessionId}` },
  reasoning: { effort: OPENROUTER_REASONING_EFFORT[workload] },
  usage: { include: true },
});

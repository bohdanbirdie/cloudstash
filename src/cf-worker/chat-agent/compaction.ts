import { isToolUIPart } from "ai";
import type { UIMessage } from "ai";

export const COMPACTION_TRIGGER_TOKENS = 24_000;
export const COMPACTION_TAIL_MESSAGES = 12;
export const COMPACTION_MAX_OUTPUT_TOKENS = 800;
export const COMPACTION_STORAGE_KEY = "chat:context-summary:v1";

const MAX_TOOL_DETAIL_CHARS = 2_000;

export interface ChatContextSummary {
  readonly summary: string;
  readonly throughMessageId: string;
  readonly updatedAt: string;
}

export interface ChatCompactionPlan {
  readonly previousSummary?: string;
  readonly messagesToSummarize: readonly UIMessage[];
  readonly recentMessages: readonly UIMessage[];
  readonly throughMessageId: string;
}

const estimateTextTokens = (value: string): number =>
  Math.ceil(value.length / 4);

export function estimateContextTokens(
  summary: ChatContextSummary | undefined,
  messages: readonly UIMessage[]
): number {
  const serializedMessages = messages.reduce(
    (total, message) => total + JSON.stringify(message).length,
    0
  );
  return (
    estimateTextTokens(summary?.summary ?? "") +
    Math.ceil(serializedMessages / 4) +
    messages.length * 4
  );
}

export function messagesAfterSummary(
  messages: readonly UIMessage[],
  summary: ChatContextSummary | undefined
): readonly UIMessage[] {
  if (!summary) return messages;
  const boundary = messages.findIndex(
    (message) => message.id === summary.throughMessageId
  );
  return boundary === -1 ? messages : messages.slice(boundary + 1);
}

export function planChatCompaction(
  messages: readonly UIMessage[],
  summary: ChatContextSummary | undefined
): ChatCompactionPlan | undefined {
  const pending = messagesAfterSummary(messages, summary);
  if (
    pending.length <= COMPACTION_TAIL_MESSAGES ||
    estimateContextTokens(summary, pending) <= COMPACTION_TRIGGER_TOKENS
  ) {
    return undefined;
  }

  const boundary = pending.length - COMPACTION_TAIL_MESSAGES;
  const messagesToSummarize = pending.slice(0, boundary);
  const throughMessageId = messagesToSummarize.at(-1)?.id;
  if (!throughMessageId) return undefined;

  return {
    previousSummary: summary?.summary,
    messagesToSummarize,
    recentMessages: pending.slice(boundary),
    throughMessageId,
  };
}

const compactValue = (value: unknown): string => {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  if (!serialized) return "";
  if (serialized.length <= MAX_TOOL_DETAIL_CHARS) return serialized;
  return `${serialized.slice(0, MAX_TOOL_DETAIL_CHARS)}…`;
};

function messageTranscript(message: UIMessage): string {
  const parts = message.parts.flatMap((part) => {
    if (part.type === "text") return [part.text];
    if (!isToolUIPart(part)) return [];
    const detail = "output" in part ? compactValue(part.output) : "";
    return [`Tool ${part.type.replace(/^tool-/, "")}: ${detail}`];
  });
  return `${message.role.toUpperCase()}: ${parts.join("\n")}`;
}

export function buildCompactionPrompt(plan: ChatCompactionPlan): string {
  const previous = plan.previousSummary
    ? `Existing summary:\n${plan.previousSummary}\n\n`
    : "";
  const transcript = plan.messagesToSummarize
    .map(messageTranscript)
    .join("\n\n");
  return `${previous}Update the compact conversation summary with the transcript below.

Keep only durable context needed for future turns: the user's intent and preferences, unresolved requests, decisions, referenced link titles/IDs/URLs, and tool actions that already happened. Be factual and concise. Do not address the user and do not invent details.

Transcript:
${transcript}`;
}

export function systemPromptWithSummary(
  systemPrompt: string,
  summary: ChatContextSummary | undefined
): string {
  if (!summary) return systemPrompt;
  return `${systemPrompt}\n\nEarlier conversation context:\n${summary.summary}`;
}

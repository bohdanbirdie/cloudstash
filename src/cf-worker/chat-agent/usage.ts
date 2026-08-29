import { OPENROUTER_MODEL_ID } from "../openrouter-model";

export const MODEL_PRICING: Record<
  string,
  { inputPer1M: number; outputPer1M: number }
> = {
  [OPENROUTER_MODEL_ID]: { inputPer1M: 0.2, outputPer1M: 1.2 },
};

/** Chat workloads are roughly 4:1 input:output */
export const INPUT_OUTPUT_RATIO = 4;

/**
 * Convert a USD budget into a total token limit (input + output)
 * using a blended rate based on INPUT_OUTPUT_RATIO.
 *
 * blendedRate = (ratio * inputRate + outputRate) / (ratio + 1)  per token
 * tokenLimit  = budget / blendedRate
 */
export function budgetToTokenLimit(
  budget: number,
  model = OPENROUTER_MODEL_ID
): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING[OPENROUTER_MODEL_ID];
  const inputPerToken = pricing.inputPer1M / 1_000_000;
  const outputPerToken = pricing.outputPer1M / 1_000_000;

  const blendedPerToken =
    (INPUT_OUTPUT_RATIO * inputPerToken + outputPerToken) /
    (INPUT_OUTPUT_RATIO + 1);

  return Math.floor(budget / blendedPerToken);
}

export type UsageData = {
  promptTokens: number;
  completionTokens: number;
  // In-flight reservation; counts against the cap so concurrent messages
  // can't all observe the same pre-stream usage and bypass it together.
  reservedTokens?: number;
};

export const ESTIMATED_TOKENS_PER_CALL = 10_000;

const USAGE_KEY_PREFIX = "usage:";

export function getUsageKey(period: string): string {
  return `${USAGE_KEY_PREFIX}${period}`;
}

export function getCurrentPeriod(): string {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

export const LIMIT_REACHED_MESSAGE =
  "You've reached your monthly usage limit for the chat agent. Your limit resets at the start of next month. If you need a higher limit, please contact support.";

export const BUDGET_UNAVAILABLE_MESSAGE =
  "Chat is temporarily unavailable while we verify your plan. Please try again in a moment.";

export const CHAT_DISABLED_MESSAGE =
  "Chat is no longer available on your current plan.";

/** State broadcast from ChatAgentDO to connected clients */
export type ChatAgentState = {
  usage?: {
    used: number; // tokens used
    limit: number; // token limit
    budget: number; // USD budget
    period: string; // "YYYY-MM"
  };
};

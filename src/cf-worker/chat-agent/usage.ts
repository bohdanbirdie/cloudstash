export const MODEL_PRICING: Record<
  string,
  { inputPer1M: number; outputPer1M: number }
> = {
  "google/gemini-2.5-flash": { inputPer1M: 0.3, outputPer1M: 2.5 },
};

export const DEFAULT_MONTHLY_BUDGET = 0.5; // USD

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
  model = "google/gemini-2.5-flash"
): number {
  const pricing =
    MODEL_PRICING[model] ?? MODEL_PRICING["google/gemini-2.5-flash"];
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
};

const USAGE_KEY_PREFIX = "usage:";

export function getUsageKey(period: string): string {
  return `${USAGE_KEY_PREFIX}${period}`;
}

export function getCurrentPeriod(): string {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

export const LIMIT_REACHED_MESSAGE =
  "You've reached your monthly usage limit for the chat agent. Your limit resets at the start of next month. If you need a higher limit, please contact your workspace admin.";

/** State broadcast from ChatAgentDO to connected clients */
export type ChatAgentState = {
  usage?: {
    used: number; // tokens used
    limit: number; // token limit
    budget: number; // USD budget
    period: string; // "YYYY-MM"
  };
};

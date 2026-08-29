import { Option, Schema } from "effect";

const MICRO_USD_PER_USD = 1_000_000;

const AiMeterLimit = Schema.NumberFromString.check(Schema.isGreaterThan(0));
const OpenRouterMetadata = Schema.Struct({
  openrouter: Schema.Struct({
    usage: Schema.Struct({
      cost: Schema.optional(Schema.Number),
    }),
  }),
});

export function usdToMicroUsd(value: number): number | undefined {
  if (!Number.isFinite(value) || value < 0) return undefined;
  const microUsd = Math.ceil(value * MICRO_USD_PER_USD);
  return Number.isSafeInteger(microUsd) ? microUsd : undefined;
}

export function parseAiMeterLimit(
  value: string | undefined
): number | undefined {
  if (!value) return undefined;
  return Schema.decodeUnknownOption(AiMeterLimit)(value).pipe(
    Option.flatMap((usd) => Option.fromNullishOr(usdToMicroUsd(usd))),
    Option.getOrUndefined
  );
}

export function openRouterCostMicroUsd(
  providerMetadata: unknown
): number | undefined {
  return Schema.decodeUnknownOption(OpenRouterMetadata)(providerMetadata).pipe(
    Option.flatMap(({ openrouter }) =>
      Option.fromNullishOr(openrouter.usage.cost)
    ),
    Option.flatMap((usd) => Option.fromNullishOr(usdToMicroUsd(usd))),
    Option.getOrUndefined
  );
}

export const ProviderSpend = Schema.Struct({
  complete: Schema.Boolean,
  spentMicroUsd: Schema.Number,
});
export type ProviderSpend = Schema.Schema.Type<typeof ProviderSpend>;

export function openRouterSpend(metadata: readonly unknown[]): ProviderSpend {
  let complete = true;
  let spentMicroUsd = 0;
  for (const item of metadata) {
    const cost = openRouterCostMicroUsd(item);
    if (cost === undefined) {
      complete = false;
      continue;
    }
    spentMicroUsd += cost;
  }
  return { complete, spentMicroUsd };
}

export const UsageData = Schema.Struct({
  spentMicroUsd: Schema.Number,
});
export type UsageData = Schema.Schema.Type<typeof UsageData>;

export const UsageSettlement = Schema.Struct({
  spentMicroUsd: Schema.Number,
  recordedAt: Schema.String,
});
export type UsageSettlement = Schema.Schema.Type<typeof UsageSettlement>;

export const AssistantCreditStatus = Schema.Struct({
  limit: Schema.Number,
  remaining: Schema.Number,
  resetsAt: Schema.String,
});
export type AssistantCreditStatus = Schema.Schema.Type<
  typeof AssistantCreditStatus
>;

export function assistantCreditStatus(
  data: UsageData | undefined,
  creditLimit: number,
  limitMicroUsd: number,
  resetsAt: string
): AssistantCreditStatus {
  const usedCredits = Math.min(
    creditLimit,
    Math.ceil(((data?.spentMicroUsd ?? 0) / limitMicroUsd) * creditLimit)
  );
  return AssistantCreditStatus.make({
    limit: creditLimit,
    remaining: Math.max(0, creditLimit - usedCredits),
    resetsAt,
  });
}

const USAGE_KEY_PREFIX = "usage:";
const USAGE_SETTLEMENT_KEY_PREFIX = "usage-settlement:";

export function getUsageKey(period: string): string {
  return `${USAGE_KEY_PREFIX}${period}`;
}

export function getUsageSettlementKey(
  period: string,
  settlementId: string
): string {
  return `${USAGE_SETTLEMENT_KEY_PREFIX}${period}:${settlementId}`;
}

export const LIMIT_REACHED_MESSAGE =
  "You've used this month's Assistant credits. They reset with your next monthly allowance.";

export const ALLOWANCE_UNAVAILABLE_MESSAGE =
  "Chat is temporarily unavailable while we verify your plan. Please try again in a moment.";

export const CHAT_DISABLED_MESSAGE =
  "Chat is no longer available on your current plan.";

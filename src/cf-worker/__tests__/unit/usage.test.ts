import { describe, expect, it } from "vitest";

import {
  assistantCreditStatus,
  getUsageKey,
  getUsageSettlementKey,
  openRouterCostMicroUsd,
  openRouterSpend,
  openRouterUsageTelemetry,
  parseAiMeterLimit,
  usdToMicroUsd,
} from "../../chat-agent/usage";

describe("usage", () => {
  it("uses stable monthly aggregate and settlement keys", () => {
    const windowId = "2026-02-17T14:30:00.000Z";
    expect(getUsageKey(windowId)).toBe(`usage:${windowId}`);
    expect(getUsageSettlementKey(windowId, "turn-1")).toBe(
      `usage-settlement:${windowId}:turn-1`
    );
  });

  it("parses a positive private monthly limit into integer microdollars", () => {
    expect(parseAiMeterLimit("2.5")).toBe(2_500_000);
    expect(parseAiMeterLimit("0")).toBeUndefined();
    expect(parseAiMeterLimit("not-a-number")).toBeUndefined();
    expect(parseAiMeterLimit(undefined)).toBeUndefined();
  });

  it("rounds provider cost up to avoid under-accounting", () => {
    expect(usdToMicroUsd(0.000_001_1)).toBe(2);
    expect(usdToMicroUsd(-1)).toBeUndefined();
  });

  it("reads actual OpenRouter cost from provider metadata", () => {
    expect(
      openRouterCostMicroUsd({
        openrouter: {
          usage: {
            cost: 0.001_234,
            promptTokens: 100,
            completionTokens: 20,
            totalTokens: 120,
          },
        },
      })
    ).toBe(1_234);
    expect(openRouterCostMicroUsd({})).toBeUndefined();
  });

  it("sums every provider step and marks incomplete accounting", () => {
    const result = openRouterSpend([
      { openrouter: { usage: { cost: 0.001 } } },
      { openrouter: { usage: { cost: 0.002 } } },
      {},
    ]);
    expect(result).toEqual({ complete: false, spentMicroUsd: 3_000 });
  });

  it("aggregates cache and reasoning telemetry across provider steps", () => {
    const result = openRouterUsageTelemetry([
      {
        providerMetadata: { openrouter: { usage: { cost: 0.001 } } },
        usage: {
          inputTokens: 100,
          inputTokenDetails: {
            noCacheTokens: 60,
            cacheReadTokens: 30,
            cacheWriteTokens: 10,
          },
          outputTokens: 25,
          outputTokenDetails: { textTokens: 20, reasoningTokens: 5 },
          totalTokens: 125,
        },
      },
      {
        providerMetadata: { openrouter: { usage: { cost: 0.002 } } },
        usage: {
          inputTokens: 80,
          inputTokenDetails: {
            noCacheTokens: 80,
            cacheReadTokens: undefined,
            cacheWriteTokens: undefined,
          },
          outputTokens: 10,
          outputTokenDetails: {
            textTokens: 10,
            reasoningTokens: undefined,
          },
          totalTokens: 90,
        },
      },
    ]);

    expect(result).toEqual({
      cacheReadTokens: 30,
      cacheWriteTokens: 10,
      inputTokens: 180,
      outputTokens: 35,
      reasoningTokens: 5,
      spend: { complete: true, spentMicroUsd: 3_000 },
      stepCount: 2,
    });
  });

  it("reports public credits without exposing provider cost", () => {
    expect(
      assistantCreditStatus(
        { spentMicroUsd: 250_000 },
        1_000,
        1_000_000,
        "2026-09-17T14:30:00.000Z"
      )
    ).toEqual({
      limit: 1_000,
      remaining: 750,
      resetsAt: "2026-09-17T14:30:00.000Z",
    });
  });
});

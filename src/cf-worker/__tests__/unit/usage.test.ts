import { describe, expect, it } from "vitest";

import {
  assistantCreditStatus,
  getUsageKey,
  getUsageSettlementKey,
  openRouterCostMicroUsd,
  openRouterSpend,
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

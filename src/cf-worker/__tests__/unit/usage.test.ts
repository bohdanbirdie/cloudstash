import { describe, it, expect } from "vitest";

import {
  budgetToTokenLimit,
  getCurrentPeriod,
  getUsageKey,
  MODEL_PRICING,
  INPUT_OUTPUT_RATIO,
} from "../../chat-agent/usage";
import { OPENROUTER_MODEL_ID } from "../../openrouter-model";

describe("usage", () => {
  describe("getCurrentPeriod", () => {
    it("returns YYYY-MM format", () => {
      const period = getCurrentPeriod();
      expect(period).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  describe("getUsageKey", () => {
    it("prefixes period with 'usage:'", () => {
      expect(getUsageKey("2026-02")).toBe("usage:2026-02");
    });
  });

  describe("budgetToTokenLimit", () => {
    it("calculates correct limit for default model", () => {
      const budget = 0.5; // $0.50
      const limit = budgetToTokenLimit(budget);

      // Manual calculation:
      // inputPerToken = 0.20 / 1_000_000 = 0.0000002
      // outputPerToken = 1.20 / 1_000_000 = 0.0000012
      // blendedPerToken = (4 * 0.0000002 + 0.0000012) / 5 = 0.0000004
      // tokenLimit = 0.5 / 0.0000004 = 1_250_000
      expect(limit).toBe(1_250_000);
    });

    it("scales approximately linearly with budget", () => {
      const limit1 = budgetToTokenLimit(0.5);
      const limit2 = budgetToTokenLimit(1.0);

      // Allow for rounding differences (Math.floor applied independently)
      expect(limit2).toBeGreaterThanOrEqual(limit1 * 2 - 1);
      expect(limit2).toBeLessThanOrEqual(limit1 * 2 + 1);
    });

    it("returns 0 for zero budget", () => {
      expect(budgetToTokenLimit(0)).toBe(0);
    });

    it("falls back to default model for unknown model", () => {
      const defaultLimit = budgetToTokenLimit(0.5);
      const unknownLimit = budgetToTokenLimit(0.5, "unknown/model");

      expect(unknownLimit).toBe(defaultLimit);
    });

    it("uses correct pricing from MODEL_PRICING", () => {
      const budget = 1.0;
      const pricing = MODEL_PRICING[OPENROUTER_MODEL_ID];

      const inputPerToken = pricing.inputPer1M / 1_000_000;
      const outputPerToken = pricing.outputPer1M / 1_000_000;
      const blendedPerToken =
        (INPUT_OUTPUT_RATIO * inputPerToken + outputPerToken) /
        (INPUT_OUTPUT_RATIO + 1);
      const expected = Math.floor(budget / blendedPerToken);

      expect(budgetToTokenLimit(budget)).toBe(expected);
    });
  });
});

import { describe, expect, it } from "vitest";

import type { UsageData, UsageSettlement } from "../usage";
import { hasSpendAvailableIn, settleSpendIn } from "../usage-core";
import type { UsageStorage } from "../usage-core";

function makeStorage(initial?: UsageData): {
  settlements: Map<string, UsageSettlement>;
  state: { current: UsageData | undefined };
  storage: UsageStorage;
} {
  const settlements = new Map<string, UsageSettlement>();
  const state: { current: UsageData | undefined } = { current: initial };
  const storage: UsageStorage = {
    getUsage: async () => state.current,
    getSettlement: async (id) => settlements.get(id),
    putUsage: async (data) => {
      state.current = data;
    },
    putSettlement: async (id, data) => {
      settlements.set(id, data);
    },
  };
  return { settlements, state, storage };
}

describe("hasSpendAvailableIn", () => {
  it("allows work below the private period limit", async () => {
    const { storage } = makeStorage({ spentMicroUsd: 999 });
    expect(await hasSpendAvailableIn(storage, 1_000)).toBe(true);
  });

  it("rejects work at the private period limit", async () => {
    const { storage } = makeStorage({ spentMicroUsd: 1_000 });
    expect(await hasSpendAvailableIn(storage, 1_000)).toBe(false);
  });
});

describe("settleSpendIn", () => {
  it("adds actual provider spend to the monthly aggregate", async () => {
    const { state, storage } = makeStorage({ spentMicroUsd: 100 });
    expect(
      await settleSpendIn(storage, "turn-1", 250, "2026-08-29T00:00:00.000Z")
    ).toBe(true);
    expect(state.current).toEqual({ spentMicroUsd: 350 });
  });

  it("makes a repeated settlement idempotent", async () => {
    const { settlements, state, storage } = makeStorage();
    expect(await settleSpendIn(storage, "turn-1", 250)).toBe(true);
    expect(await settleSpendIn(storage, "turn-1", 250)).toBe(false);
    expect(state.current).toEqual({ spentMicroUsd: 250 });
    expect(settlements.size).toBe(1);
  });

  it("rejects invalid monetary records", async () => {
    const { storage } = makeStorage();
    await expect(settleSpendIn(storage, "turn-1", -1)).rejects.toThrow(
      "non-negative microdollars"
    );
  });
});

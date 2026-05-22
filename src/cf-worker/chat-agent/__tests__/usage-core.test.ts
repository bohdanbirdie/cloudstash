import { describe, expect, it } from "vitest";

import type { UsageData } from "../usage";
import { reconcileTokenUsageIn, reserveTokensIn } from "../usage-core";
import type { UsageStorage } from "../usage-core";

function makeStorage(initial?: UsageData): {
  storage: UsageStorage;
  state: { current: UsageData | undefined };
} {
  const state: { current: UsageData | undefined } = { current: initial };
  const storage: UsageStorage = {
    get: async () => state.current,
    put: async (data) => {
      state.current = data;
    },
  };
  return { state, storage };
}

describe("reserveTokensIn", () => {
  it("reserves tokens when there is room and reports true", async () => {
    const { state, storage } = makeStorage();
    const ok = await reserveTokensIn(storage, 100, 1000);
    expect(ok).toBe(true);
    expect(state.current).toEqual({
      completionTokens: 0,
      promptTokens: 0,
      reservedTokens: 100,
    });
  });

  it("counts existing prompt/completion/reserved against the cap", async () => {
    const { state, storage } = makeStorage({
      completionTokens: 200,
      promptTokens: 300,
      reservedTokens: 400,
    });
    const ok = await reserveTokensIn(storage, 100, 1000);
    expect(ok).toBe(true);
    expect(state.current?.reservedTokens).toBe(500);
  });

  it("refuses when reservation would exceed the cap and leaves storage untouched", async () => {
    const { state, storage } = makeStorage({
      completionTokens: 400,
      promptTokens: 400,
      reservedTokens: 100,
    });
    const ok = await reserveTokensIn(storage, 200, 1000);
    expect(ok).toBe(false);
    expect(state.current?.reservedTokens).toBe(100);
  });

  it("refuses when used + estimate exactly equals limit + 1 (boundary)", async () => {
    const { storage } = makeStorage({
      completionTokens: 0,
      promptTokens: 0,
      reservedTokens: 901,
    });
    expect(await reserveTokensIn(storage, 100, 1000)).toBe(false);
  });

  it("admits at the exact limit boundary (used + estimate === limit)", async () => {
    const { state, storage } = makeStorage({
      completionTokens: 0,
      promptTokens: 0,
      reservedTokens: 900,
    });
    expect(await reserveTokensIn(storage, 100, 1000)).toBe(true);
    expect(state.current?.reservedTokens).toBe(1000);
  });
});

describe("reconcileTokenUsageIn", () => {
  it("subtracts the reservation and adds the actual usage", async () => {
    const { state, storage } = makeStorage({
      completionTokens: 50,
      promptTokens: 100,
      reservedTokens: 1000,
    });
    await reconcileTokenUsageIn(storage, 200, 80, 1000);
    expect(state.current).toEqual({
      completionTokens: 130,
      promptTokens: 300,
      reservedTokens: 0,
    });
  });

  it("clamps reservedTokens at zero when release > reserved", async () => {
    const { state, storage } = makeStorage({
      completionTokens: 0,
      promptTokens: 0,
      reservedTokens: 100,
    });
    await reconcileTokenUsageIn(storage, 0, 0, 500);
    expect(state.current?.reservedTokens).toBe(0);
  });

  it("treats missing usage as zero baseline", async () => {
    const { state, storage } = makeStorage();
    await reconcileTokenUsageIn(storage, 50, 25, 0);
    expect(state.current).toEqual({
      completionTokens: 25,
      promptTokens: 50,
      reservedTokens: 0,
    });
  });
});

import { describe, expect, it } from "vitest";

import {
  DURABLE_OBJECT_RETIRED_KEY,
  retireDurableObjectStorage,
} from "../../durable-object-retirement";

const makeStorage = (initial: Record<string, unknown>) => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    storage: {
      deleteAll: async () => {
        data.clear();
      },
      get: async <Value>(key: string) => data.get(key) as Value | undefined,
      put: async <Value>(key: string, value: Value) => {
        data.set(key, value);
      },
    },
  };
};

describe("retireDurableObjectStorage", () => {
  it("runs cleanup behind a durable fence and leaves only the fence", async () => {
    const { data, storage } = makeStorage({ content: "private" });

    await retireDurableObjectStorage(storage, async () => {
      expect(data.get(DURABLE_OBJECT_RETIRED_KEY)).toBe(true);
      data.set("cleanup-write", true);
    });

    expect(Object.fromEntries(data)).toEqual({
      [DURABLE_OBJECT_RETIRED_KEY]: true,
    });
  });

  it("still wipes and fences storage when cleanup fails", async () => {
    const { data, storage } = makeStorage({ content: "private" });
    const failure = new Error("shutdown failed");

    await expect(
      retireDurableObjectStorage(storage, async () => {
        throw failure;
      })
    ).rejects.toBe(failure);

    expect(Object.fromEntries(data)).toEqual({
      [DURABLE_OBJECT_RETIRED_KEY]: true,
    });
  });
});

import { describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import { expect, vi } from "vitest";

import { DbClient } from "../../db/service";
import { cleanupExpiredOAuthTransientRecords } from "../oauth-transient-cleanup";

const cleanupLayer = (remove: () => { where: () => Promise<unknown> }) =>
  Layer.succeed(DbClient, {
    delete: remove,
  } as unknown as DbClient["Service"]);

describe("cleanupExpiredOAuthTransientRecords", () => {
  it.effect("cleans both transient tables at most once per window", () => {
    const database = {} as D1Database;
    const where = vi.fn(() => Promise.resolve());
    const remove = vi.fn(() => ({ where }));
    const cleanup = cleanupExpiredOAuthTransientRecords(database).pipe(
      Effect.provide(cleanupLayer(remove))
    );

    return Effect.gen(function* () {
      yield* cleanup;
      yield* cleanup;
      expect(remove).toHaveBeenCalledTimes(2);
      expect(where).toHaveBeenCalledTimes(2);

      yield* TestClock.adjust("5 minutes");
      yield* cleanup;
      expect(remove).toHaveBeenCalledTimes(4);
      expect(where).toHaveBeenCalledTimes(4);
    });
  });

  it.effect("allows an immediate retry after cleanup fails", () => {
    const retryDatabase = {} as D1Database;
    const where = vi
      .fn()
      .mockRejectedValueOnce(new Error("D1 unavailable"))
      .mockResolvedValue(undefined);
    const remove = vi.fn(() => ({ where }));
    const cleanup = cleanupExpiredOAuthTransientRecords(retryDatabase).pipe(
      Effect.provide(cleanupLayer(remove))
    );

    return Effect.gen(function* () {
      const first = yield* Effect.exit(cleanup);
      expect(first._tag).toBe("Failure");

      yield* cleanup;
      expect(remove).toHaveBeenCalledTimes(4);
      expect(where).toHaveBeenCalledTimes(4);
    });
  });
});

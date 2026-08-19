import { describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import { expect, vi } from "vitest";

import { DbClient } from "../../db/service";
import { cleanupExpiredVerifications } from "../verification-cleanup";

const cleanupLayer = (where: () => Promise<unknown>) =>
  Layer.succeed(DbClient, {
    delete: () => ({ where }),
  } as unknown as DbClient["Service"]);

describe("cleanupExpiredVerifications", () => {
  it.effect("runs at most once per database during the cleanup window", () => {
    const database = {} as D1Database;
    const where = vi.fn(() => Promise.resolve());
    const cleanup = cleanupExpiredVerifications(database).pipe(
      Effect.provide(cleanupLayer(where))
    );

    return Effect.gen(function* () {
      yield* cleanup;
      yield* cleanup;
      expect(where).toHaveBeenCalledOnce();

      yield* TestClock.adjust("5 minutes");
      yield* cleanup;
      expect(where).toHaveBeenCalledTimes(2);
    });
  });

  it.effect("allows an immediate retry after cleanup fails", () => {
    const retryDatabase = {} as D1Database;
    const where = vi
      .fn()
      .mockRejectedValueOnce(new Error("D1 unavailable"))
      .mockResolvedValue(undefined);
    const cleanup = cleanupExpiredVerifications(retryDatabase).pipe(
      Effect.provide(cleanupLayer(where))
    );

    return Effect.gen(function* () {
      const first = yield* Effect.exit(cleanup);
      expect(first._tag).toBe("Failure");

      yield* cleanup;
      expect(where).toHaveBeenCalledTimes(2);
    });
  });
});

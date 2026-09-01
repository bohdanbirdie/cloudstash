import { describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

import {
  getOrCreateProcessingAttempt,
  processingAttemptKey,
} from "../processing-attempt";

class TestStorage {
  private readonly values = new Map<string, unknown>();

  transaction<T>(
    run: (transaction: DurableObjectTransaction) => Promise<T>
  ): Promise<T> {
    return run(this as unknown as DurableObjectTransaction);
  }

  get<T>(key: string): Promise<T | undefined> {
    return Promise.resolve(this.values.get(key) as T | undefined);
  }

  put(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }

  delete(key: string): Promise<boolean> {
    return Promise.resolve(this.values.delete(key));
  }
}

describe("processing attempt settlement identity", () => {
  it.effect("survives resolver recreation until the terminal cleanup", () =>
    Effect.gen(function* () {
      const storage = new TestStorage();
      const first = yield* getOrCreateProcessingAttempt(
        storage as unknown as DurableObjectStorage,
        "link-1",
        false
      );
      const afterRecreation = yield* getOrCreateProcessingAttempt(
        storage as unknown as DurableObjectStorage,
        "link-1",
        true
      );

      expect(afterRecreation).toEqual(first);

      yield* Effect.promise(() =>
        storage.delete(processingAttemptKey("link-1"))
      );
      const nextAttempt = yield* getOrCreateProcessingAttempt(
        storage as unknown as DurableObjectStorage,
        "link-1",
        true
      );
      expect(nextAttempt.id).not.toBe(first.id);
      expect(nextAttempt.isReprocess).toBe(true);
    })
  );
});

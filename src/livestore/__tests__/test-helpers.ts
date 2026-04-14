/// <reference lib="dom" />
import { makeInMemoryAdapter } from "@livestore/adapter-web";
import { createStorePromise } from "@livestore/livestore";
import type { Store } from "@livestore/livestore";
import { LogLevel, Logger } from "effect";

import { schema } from "../schema";

export type TestStore = Store<typeof schema>;

const nextStoreId = () => `test-store-${crypto.randomUUID()}`;

let idCounter = 0;

/**
 * Create an in-memory livestore for tests.
 * Each call returns a fresh store with a unique storeId and resets the
 * `testId()` counter so generated ids are deterministic within a test.
 *
 * Call `store.shutdownPromise()` in afterEach to release resources.
 *
 * Concurrency: relies on a module-scoped id counter and assumes tests run
 * serially within a file (vitest's default). Do not use with
 * `describe.concurrent` — per-test ids would collide.
 */
export const makeTestStore = (): Promise<TestStore> => {
  idCounter = 0;
  return createStorePromise({
    adapter: makeInMemoryAdapter(),
    schema,
    storeId: nextStoreId(),
    disableDevtools: true,
    logLevel: LogLevel.None,
  });
};

/** Deterministic id generator for tests. Reset automatically by makeTestStore. */
export const testId = (prefix: string = "id") => `${prefix}-${++idCounter}`;

/** Silences Effect runtime logs during tests. */
export const silentLogger = Logger.withMinimumLogLevel(LogLevel.None);

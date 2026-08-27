import { Data } from "effect";

export class DurableObjectRetiredError extends Data.TaggedError(
  "DurableObjectRetiredError"
)<{ readonly message: string }> {
  constructor() {
    super({ message: "Durable Object is retired" });
  }
}

export const DURABLE_OBJECT_RETIRED_KEY = "__retired__";

export interface RetirementStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  deleteAll(): Promise<void>;
}

export const markDurableObjectRetired = (
  storage: RetirementStorage
): Promise<void> => storage.put(DURABLE_OBJECT_RETIRED_KEY, true);

export const isDurableObjectRetired = async (
  storage: RetirementStorage
): Promise<boolean> =>
  (await storage.get<boolean>(DURABLE_OBJECT_RETIRED_KEY)) === true;

/**
 * Makes an actor terminal before graceful cleanup, then leaves only its
 * durable retirement marker. The first write protects against cleanup hanging
 * or failing; the final coalesced writes purge everything cleanup may leave.
 */
export const retireDurableObjectStorage = async (
  storage: RetirementStorage,
  cleanup: () => Promise<void> = () => Promise.resolve()
): Promise<void> => {
  await markDurableObjectRetired(storage);
  try {
    await cleanup();
  } finally {
    const wipe = storage.deleteAll();
    const fence = markDurableObjectRetired(storage);
    await Promise.all([wipe, fence]);
  }
};

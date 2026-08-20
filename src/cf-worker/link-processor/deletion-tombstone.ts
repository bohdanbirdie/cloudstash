/**
 * Storage-backed marker that the org tied to this LinkProcessorDO is being
 * deleted. Set by `AccountDeletionWorkflow.mark-link-processor-deleting`,
 * checked at the top of `ingestAndProcess` so racing queue messages are
 * dropped before they touch the (about-to-be-wiped) Livestore.
 *
 * Persists in DO storage rather than memory so eviction cannot lose the flag.
 * The purge path rewrites it after `ctx.storage.deleteAll()` to permanently
 * fence late queue messages and RPC calls. The live object also keeps a
 * conservative in-memory fence throughout that wipe.
 */
export const DELETION_TOMBSTONE_KEY = "__deleting__";

export interface TombstoneStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

export const setDeletionTombstone = (
  storage: TombstoneStorage
): Promise<void> => storage.put(DELETION_TOMBSTONE_KEY, true);

export const isDeletionTombstoneSet = async (
  storage: TombstoneStorage
): Promise<boolean> =>
  (await storage.get<boolean>(DELETION_TOMBSTONE_KEY)) === true;

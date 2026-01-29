import { makePersistedAdapter } from "@livestore/adapter-web";
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker";
import { type Store } from "@livestore/livestore";
import { useStore } from "@livestore/react";
import { useRouteContext } from "@tanstack/react-router";
import { Effect, Stream } from "effect";
import { useEffect, useRef } from "react";
import { unstable_batchedUpdates } from "react-dom";

import {
  fetchSyncAuthStatus,
  useSyncStatusStore,
} from "@/stores/sync-status-store";

import LiveStoreWorker from "../livestore.worker?worker";
import { schema } from "./schema";

type AppStore = Store<typeof schema>;

export const RESET_FLAG_KEY = "livestore-reset-on-logout";

/**
 * Check if we should reset OPFS persistence.
 * Flag is set on logout to clear local data for security.
 */
const shouldResetPersistence = (): boolean => {
  try {
    const flag = localStorage.getItem(RESET_FLAG_KEY);
    if (flag) {
      localStorage.removeItem(RESET_FLAG_KEY);
      return true;
    }
  } catch {
    // localStorage not available
  }
  return false;
};

const adapter = makePersistedAdapter({
  resetPersistence: shouldResetPersistence(),
  sharedWorker: LiveStoreSharedWorker,
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
});

export const useAppStore = () => {
  const { auth } = useRouteContext({ strict: false });

  if (!auth?.isAuthenticated || !auth.orgId) {
    throw new Error("useAppStore must be used within an authenticated context");
  }

  return useStore({
    adapter,
    batchUpdates: unstable_batchedUpdates,
    schema,
    storeId: auth.orgId,
  });
};

const AUTH_CHECK_COOLDOWN_MS = 5000;

const useConnectionMonitor = (store: AppStore) => {
  const lastAuthCheck = useRef(0);

  useEffect(() => {
    let aborted = false;
    const storeId = store.storeId as string;

    const handleStatusChange = (status: { isConnected: boolean }) =>
      Effect.gen(function* () {
        if (aborted) return;

        const { error, clearError } = useSyncStatusStore.getState();

        if (status.isConnected) {
          if (error?.code === "UNKNOWN") clearError();
          return;
        }

        if (error && error.code !== "UNKNOWN") return;

        const now = Date.now();
        if (now - lastAuthCheck.current < AUTH_CHECK_COOLDOWN_MS) return;
        lastAuthCheck.current = now;

        const result = yield* Effect.promise(() => fetchSyncAuthStatus(storeId));
        if (aborted) return;

        const state = useSyncStatusStore.getState();

        if (result.type === "auth_failed") {
          yield* Effect.promise(() => store.shutdownPromise().catch(() => {}));
          state.setError(result.error);
        } else {
          state.setError({
            code: "UNKNOWN",
            message: "Sync paused. Your changes are saved locally.",
          });
        }
      });

    const runMonitor = async () => {
      try {
        await store.networkStatus.changes.pipe(
          Stream.tap((s: unknown) =>
            handleStatusChange(s as { isConnected: boolean })
          ),
          Stream.runDrain,
          Effect.scoped,
          Effect.runPromise
        );
      } catch {
        // Stream ended
      }
    };

    runMonitor();

    return () => {
      aborted = true;
    };
  }, [store]);
};

export const ConnectionMonitor = () => {
  const store = useAppStore();
  useConnectionMonitor(store);
  return null;
};

import { makePersistedAdapter } from "@livestore/adapter-web";
import type { Store } from "@livestore/livestore";
import { useStore } from "@livestore/react";
import { useRouteContext } from "@tanstack/react-router";
import { Effect, Stream } from "effect";
import { useEffect, useRef } from "react";
import { unstable_batchedUpdates } from "react-dom";

import {
  fetchSyncAuthStatus,
  useSyncStatusStore,
} from "@/stores/sync-status-store";

import LiveStoreSharedWorker from "../livestore-shared-worker?sharedworker";
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
    const storeId = store.storeId;

    const handleStatusChange = (status: { isConnected: boolean }) =>
      Effect.gen(function* () {
        if (aborted) return;

        const { status: currentStatus, setStatus } =
          useSyncStatusStore.getState();

        if (status.isConnected) {
          if (currentStatus.state !== "connected") {
            setStatus({ state: "connected" });
          }
          return;
        }

        if (currentStatus.state === "error") return;

        const now = Date.now();
        if (now - lastAuthCheck.current < AUTH_CHECK_COOLDOWN_MS) return;
        lastAuthCheck.current = now;

        const result = yield* Effect.promise(() =>
          fetchSyncAuthStatus(storeId),
        );
        if (aborted) return;

        if (result.type === "auth_failed") {
          yield* Effect.promise(() => store.shutdownPromise().catch(() => {}));
          useSyncStatusStore
            .getState()
            .setStatus({
              state: "error",
              code: result.code,
              message: result.message,
            });
        }
      });

    const runMonitor = async () => {
      try {
        await store.networkStatus.changes.pipe(
          Stream.tap((s) => handleStatusChange(s)),
          Stream.runDrain,
          Effect.scoped,
          Effect.runPromise,
        );
      } catch {
        // Stream ended
      }
    };

    void runMonitor();

    return () => {
      aborted = true;
    };
  }, [store]);
};

const useRetryStateListener = (storeId: string) => {
  useEffect(() => {
    const channelName = `livestore.sync-retry.${storeId}`;
    const ch = new BroadcastChannel(channelName);

    ch.onmessage = (ev) => {
      const { status, setStatus } = useSyncStatusStore.getState();
      if (status.state === "error") return;

      const data = ev.data;
      if (data?.type === "reconnecting") {
        setStatus({ state: "reconnecting", attempt: data.attempt });
      } else if (data?.type === "waiting_for_focus") {
        setStatus({ state: "waiting_for_focus" });
      }
    };

    return () => ch.close();
  }, [storeId]);
};

const useRetryReset = (storeId: string) => {
  useEffect(() => {
    const channelName = `livestore.sync-retry.${storeId}`;

    const postReset = () => {
      const ch = new BroadcastChannel(channelName);
      ch.postMessage({ type: "reset" });
      ch.close();
    };

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const { status } = useSyncStatusStore.getState();
      if (status.state !== "waiting_for_focus") return;
      postReset();
    };

    const handleOnline = () => {
      const { status } = useSyncStatusStore.getState();
      if (status.state === "connected" || status.state === "error") return;
      postReset();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);
    window.addEventListener("online", handleOnline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
      window.removeEventListener("online", handleOnline);
    };
  }, [storeId]);
};

export const ConnectionMonitor = () => {
  const store = useAppStore();
  useEffect(() => {
    useSyncStatusStore.getState().setStoreId(store.storeId);
  }, [store.storeId]);
  useConnectionMonitor(store);
  useRetryStateListener(store.storeId);
  useRetryReset(store.storeId);
  return null;
};

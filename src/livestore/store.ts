import { makePersistedAdapter } from "@livestore/adapter-web";
import type { Store } from "@livestore/livestore";
import { useStore } from "@livestore/react";
import { Effect, Stream } from "effect";
import { useEffect, useRef } from "react";
import { unstable_batchedUpdates } from "react-dom";

import { useAuth } from "@/lib/auth";
import {
  fetchSyncAuthStatus,
  useSyncStatusStore,
} from "@/stores/sync-status-store";

import LiveStoreSharedWorker from "../livestore-shared-worker?sharedworker";
import LiveStoreWorker from "../livestore.worker?worker";
import { schema } from "./schema";

type AppStore = Store<typeof schema>;

const adapter = makePersistedAdapter({
  sharedWorker: LiveStoreSharedWorker,
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
});

export const useAppStore = () => {
  const auth = useAuth();

  if (!auth.isAuthenticated || !auth.orgId) {
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

        setStatus({ state: "reconnecting" });

        const now = Date.now();
        if (now - lastAuthCheck.current < AUTH_CHECK_COOLDOWN_MS) return;
        lastAuthCheck.current = now;

        const result = yield* Effect.promise(() =>
          fetchSyncAuthStatus(storeId)
        );
        if (aborted) return;

        if (result.type === "auth_failed") {
          yield* Effect.promise(() => store.shutdownPromise().catch(() => {}));
          useSyncStatusStore.getState().setStatus({
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
          Effect.runPromise
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

export const ConnectionMonitor = () => {
  const store = useAppStore();
  useConnectionMonitor(store);
  return null;
};

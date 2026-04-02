import { toast } from "sonner";
import { create } from "zustand";

export type SyncErrorCode =
  | "SESSION_EXPIRED"
  | "ACCESS_DENIED"
  | "UNAPPROVED"
  | "RATE_LIMITED"
  | "UNKNOWN";

export type SyncStatus =
  | { state: "connected" }
  | { state: "reconnecting"; attempt: number }
  | { state: "error"; code: SyncErrorCode; message: string };

export type SyncAuthResult =
  | { type: "auth_ok" }
  | { type: "auth_failed"; code: SyncErrorCode; message: string }
  | { type: "network_error" };

interface SyncStatusState {
  storeId: string | null;
  status: SyncStatus;
  setStoreId: (storeId: string) => void;
  setStatus: (status: SyncStatus) => void;
}

export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  storeId: null,
  status: { state: "connected" },
  setStoreId: (storeId) => set({ storeId }),
  setStatus: (status) => set({ status }),
}));

export function sendBroadcast(channelName: string, data: unknown): void {
  const ch = new BroadcastChannel(channelName);
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- BroadcastChannel, not window
  ch.postMessage(data);
  ch.close();
}

export async function fetchSyncAuthStatus(
  storeId: string
): Promise<SyncAuthResult> {
  try {
    const res = await fetch(
      `/api/sync/auth?storeId=${encodeURIComponent(storeId)}`
    );

    if (res.ok) {
      return { type: "auth_ok" };
    }

    if (res.status === 429) {
      toast.warning("Too many requests — sync will resume shortly");
      return {
        type: "auth_failed",
        code: "RATE_LIMITED",
        message: "Too many requests. Please wait a moment.",
      };
    }

    const data: { code?: SyncErrorCode; message?: string } = await res.json();
    return {
      type: "auth_failed",
      code: data.code ?? "UNKNOWN",
      message: data.message ?? "Sync connection failed",
    };
  } catch {
    return { type: "network_error" };
  }
}

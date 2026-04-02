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
  | { state: "reconnecting" }
  | { state: "error"; code: SyncErrorCode; message: string };

export type SyncAuthResult =
  | { type: "auth_ok" }
  | { type: "auth_failed"; code: SyncErrorCode; message: string }
  | { type: "network_error" };

interface SyncStatusState {
  status: SyncStatus;
  setStatus: (status: SyncStatus) => void;
}

export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  status: { state: "connected" },
  setStatus: (status) => set({ status }),
}));

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

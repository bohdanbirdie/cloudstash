import { create } from "zustand";

export type SyncErrorCode =
  | "SESSION_EXPIRED"
  | "ACCESS_DENIED"
  | "UNAPPROVED"
  | "UNKNOWN";

export interface SyncError {
  code: SyncErrorCode;
  message: string;
}

export type SyncAuthResult =
  | { type: "auth_ok" }
  | { type: "auth_failed"; error: SyncError }
  | { type: "network_error" };

interface SyncStatusState {
  error: SyncError | null;
  setError: (error: SyncError) => void;
  clearError: () => void;
}

export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  clearError: () => set({ error: null }),
  error: null,
  setError: (error) => set({ error }),
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

    const data = (await res.json()) as { code?: string; message?: string };
    return {
      type: "auth_failed",
      error: {
        code: (data.code as SyncErrorCode) || "UNKNOWN",
        message: data.message || "Sync connection failed",
      },
    };
  } catch {
    return { type: "network_error" };
  }
}

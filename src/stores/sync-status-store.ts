import { toast } from "sonner";
import { create } from "zustand";

export type SyncErrorCode =
  | "SESSION_EXPIRED"
  | "ACCESS_DENIED"
  | "UNAPPROVED"
  | "RATE_LIMITED"
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

    if (res.status === 429) {
      toast.warning("Too many requests — sync will resume shortly");
      return {
        type: "auth_failed",
        error: {
          code: "RATE_LIMITED" satisfies SyncErrorCode,
          message: "Too many requests. Please wait a moment.",
        },
      };
    }

    const data: { code?: SyncErrorCode; message?: string } = await res.json();
    return {
      type: "auth_failed",
      error: {
        code: data.code ?? "UNKNOWN",
        message: data.message ?? "Sync connection failed",
      },
    };
  } catch {
    return { type: "network_error" };
  }
}

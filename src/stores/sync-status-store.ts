import { create } from 'zustand'

export type SyncErrorCode = 'SESSION_EXPIRED' | 'ACCESS_DENIED' | 'UNAPPROVED' | 'UNKNOWN'

type SyncError = {
  code: SyncErrorCode
  message: string
}

type SyncStatusState = {
  error: SyncError | null
  setError: (error: SyncError) => void
  clearError: () => void
}

export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  error: null,
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}))

// Fetch sync auth error from server
export async function fetchSyncAuthError(storeId: string): Promise<SyncError | null> {
  try {
    const res = await fetch(`/api/sync/auth?storeId=${encodeURIComponent(storeId)}`)
    if (res.ok) return null

    const data = (await res.json()) as { code?: string; message?: string }
    return {
      code: (data.code as SyncErrorCode) || 'UNKNOWN',
      message: data.message || 'Sync connection failed',
    }
  } catch {
    return {
      code: 'UNKNOWN',
      message: 'Failed to check sync auth status',
    }
  }
}

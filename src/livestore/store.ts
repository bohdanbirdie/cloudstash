import { makePersistedAdapter } from '@livestore/adapter-web'
import LiveStoreSharedWorker from '@livestore/adapter-web/shared-worker?sharedworker'
import { useStore } from '@livestore/react'
import { useRouteContext } from '@tanstack/react-router'
import { Effect, Stream } from 'effect'
import { useEffect, useRef } from 'react'
import { unstable_batchedUpdates } from 'react-dom'

import { fetchSyncAuthError, useSyncStatusStore } from '@/stores/sync-status-store'

import LiveStoreWorker from '../livestore.worker?worker'
import { schema } from './schema'

export const RESET_FLAG_KEY = 'livestore-reset-on-logout'

/**
 * Check if we should reset OPFS persistence.
 * Flag is set on logout to clear local data for security.
 */
const shouldResetPersistence = (): boolean => {
  try {
    const flag = localStorage.getItem(RESET_FLAG_KEY)
    if (flag) {
      localStorage.removeItem(RESET_FLAG_KEY)
      return true
    }
  } catch {
    // localStorage not available
  }
  return false
}

const adapter = makePersistedAdapter({
  storage: { type: 'opfs' },
  worker: LiveStoreWorker,
  sharedWorker: LiveStoreSharedWorker,
  resetPersistence: shouldResetPersistence(),
})

export const useAppStore = () => {
  const { auth } = useRouteContext({ strict: false })

  if (!auth?.isAuthenticated || !auth.orgId) {
    throw new Error('useAppStore must be used within an authenticated context')
  }

  return useStore({
    storeId: auth.orgId,
    schema,
    adapter,
    batchUpdates: unstable_batchedUpdates,
  })
}

/**
 * Monitor LiveStore connection and handle sync failures.
 * When connection drops, fetches the actual error reason from server.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const useConnectionMonitor = (store: any) => {
  const isHandlingDisconnect = useRef(false)

  useEffect(() => {
    let aborted = false
    const storeId = store.storeId as string

    const runMonitor = async () => {
      try {
        await store.networkStatus.changes.pipe(
          Stream.tap((s: unknown) =>
            Effect.sync(() => {
              if (aborted || isHandlingDisconnect.current) return
              const status = s as { isConnected: boolean }

              if (!status.isConnected) {
                isHandlingDisconnect.current = true

                // Fetch actual error reason from server
                fetchSyncAuthError(storeId).then(async (error) => {
                  if (aborted) return

                  // Stop retries
                  try {
                    await store.shutdownPromise()
                  } catch {
                    // Already shut down
                  }

                  // Show error
                  const { setError } = useSyncStatusStore.getState()
                  if (error) {
                    setError(error)
                  } else {
                    // Auth is OK but sync still failed - network issue?
                    setError({
                      code: 'UNKNOWN',
                      message: 'Sync connection lost. Please reload to reconnect.',
                    })
                  }
                })
              }
            }),
          ),
          Stream.runDrain,
          Effect.scoped,
          Effect.runPromise,
        )
      } catch {
        // Stream ended
      }
    }

    runMonitor()

    return () => {
      aborted = true
    }
  }, [store])
}

/**
 * Component that monitors LiveStore connection status.
 * Place inside StoreRegistryProvider to enable connection monitoring.
 * Shows error banner when sync fails with actual reason from server.
 */
export const ConnectionMonitor = () => {
  const store = useAppStore()
  useConnectionMonitor(store)
  return null
}

import { makePersistedAdapter } from '@livestore/adapter-web'
import LiveStoreSharedWorker from '@livestore/adapter-web/shared-worker?sharedworker'
import { useStore } from '@livestore/react'
import { useRouteContext } from '@tanstack/react-router'
import { unstable_batchedUpdates } from 'react-dom'

import LiveStoreWorker from '../livestore.worker?worker'
import { schema, SyncPayload } from './schema'

const adapter = makePersistedAdapter({
  storage: { type: 'opfs' },
  worker: LiveStoreWorker,
  sharedWorker: LiveStoreSharedWorker,
})

export const useAppStore = () => {
  const { auth } = useRouteContext({ strict: false })

  if (!auth?.isAuthenticated || !auth.orgId || !auth.jwt) {
    throw new Error('useAppStore must be used within an authenticated context')
  }

  return useStore({
    storeId: auth.orgId,
    schema,
    adapter,
    batchUpdates: unstable_batchedUpdates,
    syncPayloadSchema: SyncPayload,
    syncPayload: { authToken: auth.jwt },
  })
}

import { makePersistedAdapter } from "@livestore/adapter-web"
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker"
import { useStore } from "@livestore/react"
import { unstable_batchedUpdates } from "react-dom"

import LiveStoreWorker from "../livestore.worker?worker"
import { getStoreId } from "../util/store-id"
import { schema, SyncPayload } from "./schema"

const storeId = getStoreId()

const adapter = makePersistedAdapter({
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
  sharedWorker: LiveStoreSharedWorker,
})

export const useAppStore = () =>
  useStore({
    storeId,
    schema,
    adapter,
    batchUpdates: unstable_batchedUpdates,
    syncPayloadSchema: SyncPayload,
    syncPayload: { authToken: "insecure-token-change-me" },
  })

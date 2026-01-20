import { useCallback } from 'react'
import { useAppStore } from '@/livestore/store'
import { events } from '@/livestore/schema'

export function useTrackLinkOpen() {
  const store = useAppStore()

  return useCallback(
    (linkId: string) => {
      store.commit(
        events.linkInteracted({
          id: crypto.randomUUID(),
          linkId,
          type: 'opened',
          occurredAt: new Date(),
        }),
      )
    },
    [store],
  )
}

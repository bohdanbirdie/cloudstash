import { useState, useCallback } from 'react'
import { events } from '@/livestore/schema'
import { useAppStore } from '@/livestore/store'
import type { LinkWithDetails } from '@/livestore/queries'

export function useLinkDetailActions(links: readonly LinkWithDetails[]) {
  const store = useAppStore()
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const selectedLink = selectedIndex !== null ? (links[selectedIndex] ?? null) : null
  const hasPrevious = selectedIndex !== null && selectedIndex > 0
  const hasNext = selectedIndex !== null && selectedIndex < links.length - 1

  const open = (index: number) => setSelectedIndex(index)
  const close = () => setSelectedIndex(null)

  const goToPrevious = () => {
    if (hasPrevious) setSelectedIndex(selectedIndex - 1)
  }

  const goToNext = () => {
    if (hasNext) setSelectedIndex(selectedIndex + 1)
  }

  const moveAfterAction = useCallback(() => {
    if (hasNext) return
    if (hasPrevious) setSelectedIndex(selectedIndex - 1)
    else setSelectedIndex(null)
  }, [hasNext, hasPrevious, selectedIndex])

  const complete = useCallback(() => {
    if (!selectedLink) return
    store.commit(events.linkCompleted({ id: selectedLink.id, completedAt: new Date() }))
    moveAfterAction()
  }, [selectedLink, store, moveAfterAction])

  const uncomplete = useCallback(() => {
    if (!selectedLink) return
    store.commit(events.linkUncompleted({ id: selectedLink.id }))
    moveAfterAction()
  }, [selectedLink, store, moveAfterAction])

  const remove = useCallback(() => {
    if (!selectedLink) return
    store.commit(events.linkDeleted({ id: selectedLink.id, deletedAt: new Date() }))
    moveAfterAction()
  }, [selectedLink, store, moveAfterAction])

  const restore = useCallback(() => {
    if (!selectedLink) return
    store.commit(events.linkRestored({ id: selectedLink.id }))
    moveAfterAction()
  }, [selectedLink, store, moveAfterAction])

  return {
    selectedLink,
    isOpen: selectedIndex !== null,
    hasPrevious,
    hasNext,
    open,
    close,
    goToPrevious,
    goToNext,
    complete,
    uncomplete,
    remove,
    restore,
  }
}

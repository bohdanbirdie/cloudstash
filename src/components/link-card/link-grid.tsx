import { useState, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react'
import { events } from '@/livestore/schema'
import { useAppStore } from '@/livestore/store'
import { useModifierHold } from '@/hooks/use-modifier-hold'
import type { LinkWithDetails } from '@/livestore/queries'
import { LinkCard } from './link-card'
import { LinkDetailModal } from './link-detail-modal'

interface LinkGridProps {
  links: readonly LinkWithDetails[]
  emptyMessage?: string
  onSelectionChange?: (selectedLinks: LinkWithDetails[]) => void
}

export interface LinkGridRef {
  clearSelection: () => void
}

export const LinkGrid = forwardRef<LinkGridRef, LinkGridProps>(function LinkGrid(
  { links, emptyMessage = 'No links yet', onSelectionChange },
  ref
) {
  const store = useAppStore()
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const selectionMode = useModifierHold(0)

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  useImperativeHandle(ref, () => ({ clearSelection }), [clearSelection])

  useEffect(() => {
    onSelectionChange?.(links.filter((link) => selectedIds.has(link.id)))
  }, [selectedIds, links, onSelectionChange])

  useEffect(() => {
    const linkIdSet = new Set(links.map((l) => l.id))
    setSelectedIds((prev) => {
      const next = new Set<string>()
      for (const id of prev) {
        if (linkIdSet.has(id)) next.add(id)
      }
      return next
    })
  }, [links])

  const selectedLink = selectedIndex !== null ? (links[selectedIndex] ?? null) : null
  const hasPrevious = selectedIndex !== null && selectedIndex > 0
  const hasNext = selectedIndex !== null && selectedIndex < links.length - 1

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

  const handleComplete = useCallback(() => {
    if (!selectedLink) return
    store.commit(events.linkCompleted({ id: selectedLink.id, completedAt: new Date() }))
    moveAfterAction()
  }, [selectedLink, store, moveAfterAction])

  const handleUncomplete = useCallback(() => {
    if (!selectedLink) return
    store.commit(events.linkUncompleted({ id: selectedLink.id }))
    moveAfterAction()
  }, [selectedLink, store, moveAfterAction])

  const handleDelete = useCallback(() => {
    if (!selectedLink) return
    store.commit(events.linkDeleted({ id: selectedLink.id, deletedAt: new Date() }))
    moveAfterAction()
  }, [selectedLink, store, moveAfterAction])

  const handleRestore = useCallback(() => {
    if (!selectedLink) return
    store.commit(events.linkRestored({ id: selectedLink.id }))
    moveAfterAction()
  }, [selectedLink, store, moveAfterAction])

  if (links.length === 0) {
    return <div className='text-muted-foreground text-center py-12'>{emptyMessage}</div>
  }

  return (
    <>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        {links.map((link, index) => (
          <LinkCard
            key={link.id}
            link={link}
            selected={selectedIds.has(link.id)}
            selectionMode={selectionMode}
            onClick={() => setSelectedIndex(index)}
            onSelect={() => toggleSelection(link.id)}
          />
        ))}
      </div>

      <LinkDetailModal
        link={selectedLink}
        open={selectedIndex !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedIndex(null)
        }}
        onPrevious={goToPrevious}
        onNext={goToNext}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        onComplete={handleComplete}
        onUncomplete={handleUncomplete}
        onDelete={handleDelete}
        onRestore={handleRestore}
      />
    </>
  )
})

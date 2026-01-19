import { useState, useCallback } from 'react'
import { events } from '@/livestore/schema'
import { useAppStore } from '@/livestore/store'
import type { LinkWithDetails } from '@/livestore/queries'
import { LinkCard } from './link-card'
import { LinkDetailModal } from './link-detail-modal'

interface LinkGridProps {
  links: readonly LinkWithDetails[]
  emptyMessage?: string
}

export function LinkGrid({ links, emptyMessage = 'No links yet' }: LinkGridProps) {
  const store = useAppStore()
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const selectedLink = selectedIndex !== null ? (links[selectedIndex] ?? null) : null
  const hasPrevious = selectedIndex !== null && selectedIndex > 0
  const hasNext = selectedIndex !== null && selectedIndex < links.length - 1

  const goToPrevious = () => {
    if (hasPrevious) {
      setSelectedIndex(selectedIndex - 1)
    }
  }

  const goToNext = () => {
    if (hasNext) {
      setSelectedIndex(selectedIndex + 1)
    }
  }

  const handleComplete = useCallback(() => {
    if (!selectedLink) return
    store.commit(events.linkCompleted({ id: selectedLink.id, completedAt: new Date() }))
    // Move to next link or close modal
    if (hasNext) {
      // Index stays the same since the current link will be removed from this list
    } else if (hasPrevious) {
      setSelectedIndex(selectedIndex - 1)
    } else {
      setSelectedIndex(null)
    }
  }, [selectedLink, store, hasNext, hasPrevious, selectedIndex])

  const handleUncomplete = useCallback(() => {
    if (!selectedLink) return
    store.commit(events.linkUncompleted({ id: selectedLink.id }))
    // Move to next link or close modal
    if (hasNext) {
      // Index stays the same since the current link will be removed from this list
    } else if (hasPrevious) {
      setSelectedIndex(selectedIndex - 1)
    } else {
      setSelectedIndex(null)
    }
  }, [selectedLink, store, hasNext, hasPrevious, selectedIndex])

  const handleDelete = useCallback(() => {
    if (!selectedLink) return
    store.commit(events.linkDeleted({ id: selectedLink.id, deletedAt: new Date() }))
    // Move to next link or close modal
    if (hasNext) {
      // Index stays the same since the current link will be removed from this list
    } else if (hasPrevious) {
      setSelectedIndex(selectedIndex - 1)
    } else {
      setSelectedIndex(null)
    }
  }, [selectedLink, store, hasNext, hasPrevious, selectedIndex])

  const handleRestore = useCallback(() => {
    if (!selectedLink) return
    store.commit(events.linkRestored({ id: selectedLink.id }))
    // Move to next link or close modal
    if (hasNext) {
      // Index stays the same since the current link will be removed from this list
    } else if (hasPrevious) {
      setSelectedIndex(selectedIndex - 1)
    } else {
      setSelectedIndex(null)
    }
  }, [selectedLink, store, hasNext, hasPrevious, selectedIndex])

  if (links.length === 0) {
    return <div className='text-muted-foreground text-center py-12'>{emptyMessage}</div>
  }

  return (
    <>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        {links.map((link, index) => (
          <LinkCard key={link.id} link={link} onClick={() => setSelectedIndex(index)} />
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
}

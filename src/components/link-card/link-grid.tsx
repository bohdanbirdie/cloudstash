import { useState, useEffect, useMemo } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useSelectionStore } from '@/stores/selection-store'
import { useLinkDetailStore } from '@/stores/link-detail-store'
import { useTrackLinkOpen } from '@/hooks/use-track-link-open'
import type { LinkWithDetails } from '@/livestore/queries'
import { LinkCard } from './link-card'

interface LinkGridProps {
  links: readonly LinkWithDetails[]
  emptyMessage?: string
  onSelectionChange?: (selectedLinks: LinkWithDetails[]) => void
}

export function LinkGrid({
  links,
  emptyMessage = 'No links yet',
  onSelectionChange,
}: LinkGridProps) {
  const { selectedIds, anchorIndex, toggle, range, removeStale } = useSelectionStore()
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const openLinkInContext = useLinkDetailStore((s) => s.openLinkInContext)
  const trackLinkOpen = useTrackLinkOpen()

  const linkIds = useMemo(() => links.map((l) => l.id), [links])
  const validIdsSet = useMemo(() => new Set(linkIds), [linkIds])

  useHotkeys('*', (e) => setIsSelectionMode(e.metaKey || e.ctrlKey || e.shiftKey), {
    keydown: true,
    keyup: true,
  })

  useEffect(() => {
    onSelectionChange?.(links.filter((link) => selectedIds.has(link.id)))
  }, [selectedIds, links, onSelectionChange])

  useEffect(() => {
    removeStale(validIdsSet)
  }, [validIdsSet, removeStale])

  const handleCardClick = (index: number, e: React.MouseEvent) => {
    const isModifierClick = e.metaKey || e.ctrlKey || e.shiftKey
    if (!isModifierClick) {
      const link = links[index]
      if (link) trackLinkOpen(link.id)
      openLinkInContext(linkIds, index)
      return
    }
    e.preventDefault()
    if (e.shiftKey && anchorIndex !== null) {
      range(index, linkIds)
    } else {
      toggle(linkIds[index], index)
    }
  }

  if (links.length === 0) {
    return <div className='text-muted-foreground text-center py-12'>{emptyMessage}</div>
  }

  return (
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
      {links.map((link, index) => (
        <LinkCard
          key={link.id}
          link={link}
          selected={selectedIds.has(link.id)}
          selectionMode={isSelectionMode}
          onClick={(e) => handleCardClick(index, e)}
        />
      ))}
    </div>
  )
}

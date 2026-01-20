import { useState } from 'react'
import {
  ExternalLinkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
  Trash2Icon,
  CopyIcon,
  CheckCheck,
  RotateCcwIcon,
  UndoIcon,
} from 'lucide-react'
import { useAppStore } from '@/livestore/store'
import { events } from '@/livestore/schema'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Markdown } from '@/components/ui/markdown'
import { ScrollableContent } from '@/components/ui/scrollable-content'
import { TextShimmer } from '@/components/ui/text-shimmer'
import { Badge } from '@/components/ui/badge'
import { linkProcessingStatus$, linkById$ } from '@/livestore/queries'
import { HotkeyButton } from '@/components/ui/hotkey-button'
import {
  useLinkDetailStore,
  selectHasPrevious,
  selectHasNext,
  selectHasNavigation,
} from '@/stores/link-detail-store'
import type { LinkWithDetails } from '@/livestore/queries'

function StatusBadge({ link }: { link: LinkWithDetails }) {
  if (link.deletedAt) {
    return (
      <Badge variant='secondary' className='text-[10px] px-1.5 py-0 bg-muted text-muted-foreground'>
        Trash
      </Badge>
    )
  }
  if (link.status === 'completed') {
    return (
      <Badge variant='secondary' className='text-[10px] px-1.5 py-0 bg-green-500/15 text-green-600'>
        Completed
      </Badge>
    )
  }
  return null
}

function LinkDetailModalContent({ linkId }: { linkId: string }) {
  const store = useAppStore()
  const [copied, setCopied] = useState(false)

  const open = useLinkDetailStore((s) => s.open)
  const close = useLinkDetailStore((s) => s.close)
  const goToPrevious = useLinkDetailStore((s) => s.goToPrevious)
  const goToNext = useLinkDetailStore((s) => s.goToNext)
  const moveAfterAction = useLinkDetailStore((s) => s.moveAfterAction)
  const hasPrevious = useLinkDetailStore(selectHasPrevious)
  const hasNext = useLinkDetailStore(selectHasNext)
  const hasNavigation = useLinkDetailStore(selectHasNavigation)

  const link = store.useQuery(linkById$(linkId))
  const processingRecord = store.useQuery(linkProcessingStatus$(linkId))
  const isProcessing = processingRecord?.status === 'pending'

  const isCompleted = link?.status === 'completed'
  const isDeleted = link?.deletedAt !== null

  const handleCopy = async () => {
    if (!link) return
    await navigator.clipboard.writeText(link.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleComplete = () => {
    if (!link) return
    store.commit(events.linkCompleted({ id: link.id, completedAt: new Date() }))
    moveAfterAction()
  }

  const handleUncomplete = () => {
    if (!link) return
    store.commit(events.linkUncompleted({ id: link.id }))
    moveAfterAction()
  }

  const handleDelete = () => {
    if (!link) return
    store.commit(events.linkDeleted({ id: link.id, deletedAt: new Date() }))
    moveAfterAction()
  }

  const handleRestore = () => {
    if (!link) return
    store.commit(events.linkRestored({ id: link.id }))
    moveAfterAction()
  }

  if (!link) return null

  const displayTitle = link.title || link.url
  const formattedDate = new Date(link.createdAt).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <div className='flex items-center gap-2'>
            <a
              href={link.url}
              target='_blank'
              rel='noopener noreferrer'
              className='flex items-center gap-2 text-primary hover:text-primary/80 transition-colors'
            >
              {link.favicon && <img src={link.favicon} alt='' className='h-4 w-4 shrink-0' />}
              <span className='text-xs'>{link.domain}</span>
              <ExternalLinkIcon className='h-3 w-3' />
            </a>
            <button
              type='button'
              onClick={handleCopy}
              className='text-muted-foreground hover:text-foreground transition-colors p-1'
              aria-label='Copy link'
            >
              {copied ? (
                <CheckCheck className='h-3 w-3 text-green-500' />
              ) : (
                <CopyIcon className='h-3 w-3' />
              )}
            </button>
            <StatusBadge link={link} />
          </div>
          <DialogTitle className='text-base'>{displayTitle}</DialogTitle>
        </DialogHeader>

        <ScrollableContent maxHeightClass='max-h-[60vh]' className='space-y-4'>
          {link.image && (
            <div className='aspect-video w-full overflow-hidden rounded-sm flex items-center justify-center'>
              <img src={link.image} alt='' className='max-h-full max-w-full object-contain' />
            </div>
          )}

          {link.description && (
            <div className='text-sm text-muted-foreground'>
              <Markdown>{link.description}</Markdown>
            </div>
          )}

          {link.summary ? (
            <div className='border-l-2 border-primary/50 bg-muted/50 pl-3 py-2 space-y-1'>
              <h4 className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
                AI Summary
              </h4>
              <Markdown className='leading-relaxed'>{link.summary}</Markdown>
            </div>
          ) : isProcessing ? (
            <div className='border-l-2 border-muted-foreground/30 bg-muted/50 pl-3 py-2'>
              <TextShimmer className='text-sm' duration={1.5}>
                Generating summary...
              </TextShimmer>
            </div>
          ) : null}

          <div className='text-xs text-muted-foreground'>Saved on {formattedDate}</div>
        </ScrollableContent>

        <DialogFooter
          className={
            hasNavigation
              ? 'flex-row justify-between sm:justify-between'
              : 'flex-row justify-end sm:justify-end'
          }
        >
          {hasNavigation && (
            <div className='flex gap-1 items-center'>
              <HotkeyButton
                variant='outline'
                size='icon'
                onClick={goToPrevious}
                onHotkeyPress={goToPrevious}
                disabled={!hasPrevious}
                aria-label='Previous link'
                hotkey='BracketLeft'
                hotkeyEnabled={open}
              >
                <ChevronLeftIcon className='h-4 w-4' />
              </HotkeyButton>
              <HotkeyButton
                variant='outline'
                size='icon'
                onClick={goToNext}
                onHotkeyPress={goToNext}
                disabled={!hasNext}
                aria-label='Next link'
                hotkey='BracketRight'
                hotkeyEnabled={open}
              >
                <ChevronRightIcon className='h-4 w-4' />
              </HotkeyButton>
            </div>
          )}
          <div className='flex gap-1 items-center'>
            <HotkeyButton
              size='icon'
              onClick={isCompleted ? handleUncomplete : handleComplete}
              onHotkeyPress={isCompleted ? handleUncomplete : handleComplete}
              aria-label={isCompleted ? 'Mark as unread' : 'Mark as complete'}
              hotkey='meta+enter'
              hotkeyEnabled={open}
            >
              {isCompleted ? <UndoIcon className='h-4 w-4' /> : <CheckIcon className='h-4 w-4' />}
            </HotkeyButton>
            <HotkeyButton
              variant='ghost'
              size='icon'
              onClick={isDeleted ? handleRestore : handleDelete}
              onHotkeyPress={isDeleted ? handleRestore : handleDelete}
              aria-label={isDeleted ? 'Restore link' : 'Delete link'}
              hotkey='meta+backspace'
              hotkeyEnabled={open}
            >
              {isDeleted ? (
                <RotateCcwIcon className='h-4 w-4' />
              ) : (
                <Trash2Icon className='h-4 w-4' />
              )}
            </HotkeyButton>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function LinkDetailModal() {
  const linkId = useLinkDetailStore((s) => s.linkId)

  if (!linkId) return null

  return <LinkDetailModalContent linkId={linkId} />
}

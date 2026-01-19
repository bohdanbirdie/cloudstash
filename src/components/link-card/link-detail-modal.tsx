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
import { linkProcessingStatus$ } from '@/livestore/queries'
import type { LinkWithDetails } from '@/livestore/queries'
import { HotkeyButton } from '@/components/ui/hotkey-button'

interface LinkDetailModalProps {
  link: LinkWithDetails | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onPrevious: () => void
  onNext: () => void
  hasPrevious: boolean
  hasNext: boolean
  onComplete: () => void
  onUncomplete: () => void
  onDelete: () => void
  onRestore: () => void
}

export function LinkDetailModal({
  link,
  open,
  onOpenChange,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  onComplete,
  onUncomplete,
  onDelete,
  onRestore,
}: LinkDetailModalProps) {
  const store = useAppStore()
  const [copied, setCopied] = useState(false)

  const processingRecord = store.useQuery(linkProcessingStatus$(link?.id ?? ''))
  const isProcessing = processingRecord?.status === 'pending'

  const isCompleted = link?.status === 'completed'
  const isDeleted = link?.deletedAt !== null

  const handleCopy = async () => {
    if (!link) return
    await navigator.clipboard.writeText(link.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg max-h-[85vh] overflow-y-auto'>
        {link.image && (
          <div className='aspect-video w-full overflow-hidden rounded-sm -mt-2'>
            <img src={link.image} alt='' className='h-full w-full object-contain' />
          </div>
        )}

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
          </div>
          <DialogTitle className='text-base'>{displayTitle}</DialogTitle>
          {link.description && (
            <ScrollableContent
              maxHeightClass={link.summary ? 'max-h-32' : 'max-h-48'}
              className='text-sm text-muted-foreground'
            >
              <Markdown>{link.description}</Markdown>
            </ScrollableContent>
          )}
        </DialogHeader>

        {link.summary ? (
          <div className='border-l-2 border-primary/50 bg-muted/50 pl-3 py-2 space-y-1'>
            <h4 className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
              AI Summary
            </h4>
            <ScrollableContent maxHeightClass='max-h-40' fadeFromClass='from-muted/50'>
              <Markdown className='leading-relaxed'>{link.summary}</Markdown>
            </ScrollableContent>
          </div>
        ) : isProcessing ? (
          <div className='border-l-2 border-muted-foreground/30 bg-muted/50 pl-3 py-2'>
            <TextShimmer className='text-sm' duration={1.5}>
              Generating summary...
            </TextShimmer>
          </div>
        ) : null}

        <div className='text-xs text-muted-foreground'>Saved on {formattedDate}</div>

        <DialogFooter className='flex-row justify-between sm:justify-between'>
          <div className='flex gap-1 items-center'>
            <HotkeyButton
              variant='outline'
              size='icon'
              onClick={onPrevious}
              onHotkeyPress={onPrevious}
              disabled={!hasPrevious}
              aria-label='Previous link'
              hotkey='BracketLeft'
              kbdLabel='['
              hotkeyEnabled={open}
            >
              <ChevronLeftIcon className='h-4 w-4' />
            </HotkeyButton>
            <HotkeyButton
              variant='outline'
              size='icon'
              onClick={onNext}
              onHotkeyPress={onNext}
              disabled={!hasNext}
              aria-label='Next link'
              hotkey='BracketRight'
              kbdLabel=']'
              hotkeyEnabled={open}
            >
              <ChevronRightIcon className='h-4 w-4' />
            </HotkeyButton>
          </div>
          <div className='flex gap-1 items-center'>
            <HotkeyButton
              size='icon'
              onClick={isCompleted ? onUncomplete : onComplete}
              onHotkeyPress={isCompleted ? onUncomplete : onComplete}
              aria-label={isCompleted ? 'Mark as unread' : 'Mark as complete'}
              hotkey='Enter'
              kbdLabel='↵'
              hotkeyEnabled={open}
            >
              {isCompleted ? <UndoIcon className='h-4 w-4' /> : <CheckIcon className='h-4 w-4' />}
            </HotkeyButton>
            <HotkeyButton
              variant='ghost'
              size='icon'
              onClick={isDeleted ? onRestore : onDelete}
              onHotkeyPress={isDeleted ? onRestore : onDelete}
              aria-label={isDeleted ? 'Restore link' : 'Delete link'}
              hotkey='Backspace'
              kbdLabel='Bksp'
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

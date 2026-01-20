import { CheckIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { LinkWithDetails } from '@/livestore/queries'

interface LinkCardProps {
  link: LinkWithDetails
  onClick: (e: React.MouseEvent) => void
  selected?: boolean
  selectionMode?: boolean
}

export function LinkCard({ link, onClick, selected, selectionMode }: LinkCardProps) {
  const displayTitle = link.title || link.url
  const formattedDate = new Date(link.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        'block w-full text-left relative transition-all',
        selectionMode
          ? 'hover:ring-2 hover:ring-primary hover:ring-offset-2'
          : '[&_[data-slot=card]]:hover:bg-muted/50 [&_[data-slot=card]]:hover:ring-foreground/40'
      )}
    >
      {selected && (
        <div className='absolute -top-2 -right-2 z-10 rounded-full bg-primary p-1 shadow-md'>
          <CheckIcon className='h-3 w-3 text-primary-foreground' />
        </div>
      )}
      <Card
        className={cn(
          'transition-shadow',
          link.image ? 'h-full pt-0' : 'h-full',
          selected && 'ring-2 ring-primary ring-offset-2'
        )}
      >
        {link.image && (
          <div className='aspect-video w-full overflow-hidden'>
            <img src={link.image} alt='' className='h-full w-full object-cover' />
          </div>
        )}
        <CardHeader>
          <div className='flex items-center gap-2'>
            {link.favicon && <img src={link.favicon} alt='' className='h-4 w-4 shrink-0' />}
            <span className='text-muted-foreground text-xs truncate'>{link.domain}</span>
          </div>
          <CardTitle className='line-clamp-2'>{displayTitle}</CardTitle>
          {link.description && (
            <CardDescription className='line-clamp-2'>{link.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <span className='text-muted-foreground text-xs'>{formattedDate}</span>
        </CardContent>
      </Card>
    </button>
  )
}

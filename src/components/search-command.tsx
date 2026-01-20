import { useEffect, useMemo } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { ArrowRightIcon } from 'lucide-react'
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/livestore/store'
import { allLinks$, recentlyOpenedLinks$ } from '@/livestore/queries'
import type { LinkWithDetails } from '@/livestore/queries'
import { useSearchStore } from '@/stores/search-store'
import { useLinkDetailStore } from '@/stores/link-detail-store'
import { useTrackLinkOpen } from '@/hooks/use-track-link-open'
import { buildPages } from '@/config/pages'

function getStatusBadge(link: LinkWithDetails) {
  if (link.deletedAt) {
    return { label: 'Trash', className: 'bg-muted text-muted-foreground' }
  }
  if (link.status === 'completed') {
    return { label: 'Completed', className: 'bg-green-500/15 text-green-600' }
  }
  return null
}

function LinkItem({ link, onSelect }: { link: LinkWithDetails; onSelect: () => void }) {
  const status = getStatusBadge(link)
  return (
    <CommandItem
      value={`${link.title ?? ''} ${link.description ?? ''} ${link.url} ${link.domain} ${link.summary ?? ''}`}
      onSelect={onSelect}
      className='flex items-center gap-3 p-3 rounded-md border border-transparent data-[selected=true]:border-border'
    >
      <div className='flex-1 min-w-0 space-y-1'>
        <div className='flex items-center gap-2'>
          {link.favicon && <img src={link.favicon} alt='' className='h-4 w-4 shrink-0' />}
          <span className='text-muted-foreground text-xs'>{link.domain}</span>
          {status && (
            <Badge variant='secondary' className={`text-[10px] px-1.5 py-0 ${status.className}`}>
              {status.label}
            </Badge>
          )}
        </div>
        <div className='font-medium truncate'>{link.title || link.url}</div>
        {link.description && (
          <p className='text-muted-foreground text-xs line-clamp-1'>{link.description}</p>
        )}
      </div>
      <ArrowRightIcon className='h-4 w-4 shrink-0 text-muted-foreground' />
    </CommandItem>
  )
}

export function SearchCommand() {
  const { open, setOpen } = useSearchStore()
  const openLinkDetail = useLinkDetailStore((s) => s.openLink)
  const trackLinkOpen = useTrackLinkOpen()
  const store = useAppStore()
  const router = useRouter()
  const navigate = useNavigate()

  const pages = useMemo(() => buildPages(router.routeTree.children), [router.routeTree])
  const allLinks = store.useQuery(allLinks$)
  const recentLinks = store.useQuery(recentlyOpenedLinks$)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        useSearchStore.getState().toggle()
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const handleSelectLink = (link: LinkWithDetails) => {
    setOpen(false)
    trackLinkOpen(link.id)
    openLinkDetail(link.id)
  }

  const handleSelectPage = (path: string) => {
    setOpen(false)
    navigate({ to: path })
  }

  const recentLinkIds = new Set(recentLinks.map((l) => l.id))
  const otherLinks = allLinks.filter((l) => !recentLinkIds.has(l.id))

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title='Search'
      description='Search pages and links'
    >
      <Command>
        <CommandInput placeholder='Search...' />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup heading='Pages'>
            {pages.map((page) => (
              <CommandItem
                key={page.path}
                value={`page ${page.title}`}
                onSelect={() => handleSelectPage(page.path)}
                className='flex items-center gap-3 p-2'
              >
                {page.Icon && <page.Icon className='h-4 w-4 text-muted-foreground' />}
                <span>{page.title}</span>
                <ArrowRightIcon className='ml-auto h-4 w-4 shrink-0 text-muted-foreground' />
              </CommandItem>
            ))}
          </CommandGroup>

          {recentLinks.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading='Recently Opened'>
                {recentLinks.map((link) => (
                  <LinkItem key={link.id} link={link} onSelect={() => handleSelectLink(link)} />
                ))}
              </CommandGroup>
            </>
          )}

          <CommandSeparator />
          <CommandGroup heading='All Links'>
            {otherLinks.map((link) => (
              <LinkItem key={link.id} link={link} onSelect={() => handleSelectLink(link)} />
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}

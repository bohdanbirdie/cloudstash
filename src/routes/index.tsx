import { useState, useCallback, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { DownloadIcon } from 'lucide-react'
import { LinkGrid } from '@/components/link-card'
import { ExportDialog } from '@/components/export-dialog'
import { SelectionToolbar } from '@/components/selection-toolbar'
import { Button } from '@/components/ui/button'
import { events } from '@/livestore/schema'
import { useAppStore } from '@/livestore/store'
import { useSelectionStore } from '@/stores/selection-store'
import { inboxLinks$ } from '@/livestore/queries'
import type { LinkWithDetails } from '@/livestore/queries'

export const Route = createFileRoute('/')({
  component: HomePage,
  staticData: { title: 'Inbox', icon: 'inbox' },
})

function HomePage() {
  const store = useAppStore()
  const links = store.useQuery(inboxLinks$)
  const clear = useSelectionStore((s) => s.clear)
  const [exportOpen, setExportOpen] = useState(false)
  const [selectedLinks, setSelectedLinks] = useState<LinkWithDetails[]>([])

  useEffect(() => clear, [clear])

  const handleBulkComplete = useCallback(() => {
    for (const link of selectedLinks) {
      store.commit(events.linkCompleted({ id: link.id, completedAt: new Date() }))
    }
  }, [selectedLinks, store])

  const handleBulkDelete = useCallback(() => {
    for (const link of selectedLinks) {
      store.commit(events.linkDeleted({ id: link.id, deletedAt: new Date() }))
    }
  }, [selectedLinks, store])

  return (
    <div className='p-6'>
      <div className='flex items-center justify-between mb-6'>
        <div>
          <h1 className='text-2xl font-bold'>Inbox</h1>
          <p className='text-muted-foreground mt-1'>Links to read later.</p>
        </div>
        <Button variant='outline' size='sm' onClick={() => setExportOpen(true)}>
          <DownloadIcon className='h-4 w-4 mr-2' />
          Export
        </Button>
      </div>
      <LinkGrid
        links={links}
        emptyMessage='No links in your inbox'
        onSelectionChange={setSelectedLinks}
      />
      <SelectionToolbar
        selectedCount={selectedLinks.length}
        onExport={() => setExportOpen(true)}
        onComplete={handleBulkComplete}
        onDelete={handleBulkDelete}
        onClear={clear}
      />
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        links={selectedLinks.length > 0 ? selectedLinks : links}
        pageTitle={selectedLinks.length > 0 ? 'Selected Links' : 'Inbox'}
      />
    </div>
  )
}

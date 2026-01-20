import { useState, useCallback, useRef } from 'react'
import { createFileRoute, Navigate } from '@tanstack/react-router'
import { DownloadIcon } from 'lucide-react'
import { LinkGrid } from '@/components/link-card'
import type { LinkGridRef } from '@/components/link-card'
import { ExportDialog } from '@/components/export-dialog'
import { SelectionToolbar } from '@/components/selection-toolbar'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { events } from '@/livestore/schema'
import { useAppStore } from '@/livestore/store'
import { completedLinks$ } from '@/livestore/queries'
import type { LinkWithDetails } from '@/livestore/queries'

export const Route = createFileRoute('/completed')({
  component: CompletedPage,
})

function CompletedPage() {
  const { data: session } = authClient.useSession()

  if (!session) {
    return <Navigate to='/login' />
  }

  return <CompletedPageContent />
}

function CompletedPageContent() {
  const store = useAppStore()
  const links = store.useQuery(completedLinks$)
  const [exportOpen, setExportOpen] = useState(false)
  const [selectedLinks, setSelectedLinks] = useState<LinkWithDetails[]>([])
  const gridRef = useRef<LinkGridRef>(null)

  const handleBulkUncomplete = useCallback(() => {
    for (const link of selectedLinks) {
      store.commit(events.linkUncompleted({ id: link.id }))
    }
  }, [selectedLinks, store])

  const handleBulkDelete = useCallback(() => {
    for (const link of selectedLinks) {
      store.commit(events.linkDeleted({ id: link.id, deletedAt: new Date() }))
    }
  }, [selectedLinks, store])

  const handleClearSelection = useCallback(() => {
    gridRef.current?.clearSelection()
  }, [])

  return (
    <div className='p-6'>
      <div className='flex items-center justify-between mb-6'>
        <div>
          <h1 className='text-2xl font-bold'>Completed</h1>
          <p className='text-muted-foreground mt-1'>Links you've finished reading.</p>
        </div>
        <Button variant='outline' size='sm' onClick={() => setExportOpen(true)}>
          <DownloadIcon className='h-4 w-4 mr-2' />
          Export
        </Button>
      </div>
      <LinkGrid
        ref={gridRef}
        links={links}
        emptyMessage='No completed links yet'
        onSelectionChange={setSelectedLinks}
      />
      <SelectionToolbar
        selectedCount={selectedLinks.length}
        onExport={() => setExportOpen(true)}
        onComplete={handleBulkUncomplete}
        onDelete={handleBulkDelete}
        onClear={handleClearSelection}
        isCompleted
      />
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        links={selectedLinks.length > 0 ? selectedLinks : links}
        pageTitle={selectedLinks.length > 0 ? 'Selected Links' : 'Completed'}
      />
    </div>
  )
}

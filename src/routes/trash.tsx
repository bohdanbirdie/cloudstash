import { useState, useCallback, useEffect } from 'react'
import { createFileRoute, Navigate } from '@tanstack/react-router'
import { DownloadIcon } from 'lucide-react'
import { LinkGrid } from '@/components/link-card'
import { ExportDialog } from '@/components/export-dialog'
import { SelectionToolbar } from '@/components/selection-toolbar'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { events } from '@/livestore/schema'
import { useAppStore } from '@/livestore/store'
import { useSelectionStore } from '@/stores/selection-store'
import { trashLinks$ } from '@/livestore/queries'
import type { LinkWithDetails } from '@/livestore/queries'

export const Route = createFileRoute('/trash')({
  component: TrashPage,
})

function TrashPage() {
  const { data: session } = authClient.useSession()

  if (!session) {
    return <Navigate to='/login' />
  }

  return <TrashPageContent />
}

function TrashPageContent() {
  const store = useAppStore()
  const links = store.useQuery(trashLinks$)
  const clear = useSelectionStore((s) => s.clear)
  const [exportOpen, setExportOpen] = useState(false)
  const [selectedLinks, setSelectedLinks] = useState<LinkWithDetails[]>([])

  useEffect(() => clear, [clear])

  const handleBulkRestore = useCallback(() => {
    for (const link of selectedLinks) {
      store.commit(events.linkRestored({ id: link.id }))
    }
  }, [selectedLinks, store])

  return (
    <div className='p-6'>
      <div className='flex items-center justify-between mb-6'>
        <div>
          <h1 className='text-2xl font-bold'>Trash</h1>
          <p className='text-muted-foreground mt-1'>Deleted links. Empty after 30 days.</p>
        </div>
        <Button variant='outline' size='sm' onClick={() => setExportOpen(true)}>
          <DownloadIcon className='h-4 w-4 mr-2' />
          Export
        </Button>
      </div>
      <LinkGrid links={links} emptyMessage='Trash is empty' onSelectionChange={setSelectedLinks} />
      <SelectionToolbar
        selectedCount={selectedLinks.length}
        onExport={() => setExportOpen(true)}
        onDelete={handleBulkRestore}
        onClear={clear}
        showComplete={false}
        isTrash
      />
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        links={selectedLinks.length > 0 ? selectedLinks : links}
        pageTitle={selectedLinks.length > 0 ? 'Selected Links' : 'Trash'}
      />
    </div>
  )
}

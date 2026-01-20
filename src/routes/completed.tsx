import { useState } from 'react'
import { createFileRoute, Navigate } from '@tanstack/react-router'
import { DownloadIcon } from 'lucide-react'
import { LinkGrid } from '@/components/link-card'
import { ExportDialog } from '@/components/export-dialog'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { useAppStore } from '@/livestore/store'
import { completedLinks$ } from '@/livestore/queries'

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
      <LinkGrid links={links} emptyMessage='No completed links yet' />
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        links={links}
        pageTitle='Completed'
      />
    </div>
  )
}

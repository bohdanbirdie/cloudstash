import { useState } from 'react'
import { createFileRoute, Navigate } from '@tanstack/react-router'
import { DownloadIcon } from 'lucide-react'
import { LinkGrid } from '@/components/link-card'
import { ExportDialog } from '@/components/export-dialog'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { useAppStore } from '@/livestore/store'
import { allLinks$ } from '@/livestore/queries'

export const Route = createFileRoute('/all')({
  component: AllLinksPage,
})

function AllLinksPage() {
  const { data: session } = authClient.useSession()

  if (!session) {
    return <Navigate to='/login' />
  }

  return <AllLinksPageContent />
}

function AllLinksPageContent() {
  const store = useAppStore()
  const links = store.useQuery(allLinks$)
  const [exportOpen, setExportOpen] = useState(false)

  return (
    <div className='p-6'>
      <div className='flex items-center justify-between mb-6'>
        <div>
          <h1 className='text-2xl font-bold'>All Links</h1>
          <p className='text-muted-foreground mt-1'>Everything you've saved.</p>
        </div>
        <Button variant='outline' size='sm' onClick={() => setExportOpen(true)}>
          <DownloadIcon className='h-4 w-4 mr-2' />
          Export
        </Button>
      </div>
      <LinkGrid links={links} emptyMessage='No links saved yet' />
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        links={links}
        pageTitle='All Links'
      />
    </div>
  )
}

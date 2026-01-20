import { useState } from 'react'
import { createFileRoute, Navigate } from '@tanstack/react-router'
import { DownloadIcon } from 'lucide-react'
import { LinkGrid } from '@/components/link-card'
import { ExportDialog } from '@/components/export-dialog'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { useAppStore } from '@/livestore/store'
import { inboxLinks$ } from '@/livestore/queries'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const { data: session } = authClient.useSession()

  if (!session) {
    return <Navigate to='/login' />
  }

  return <HomePageContent />
}

function HomePageContent() {
  const store = useAppStore()
  const links = store.useQuery(inboxLinks$)
  const [exportOpen, setExportOpen] = useState(false)

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
      <LinkGrid links={links} emptyMessage='No links in your inbox' />
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        links={links}
        pageTitle='Inbox'
      />
    </div>
  )
}

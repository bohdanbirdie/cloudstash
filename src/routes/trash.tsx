import { createFileRoute, Navigate } from '@tanstack/react-router'
import { LinkGrid } from '@/components/link-card'
import { authClient } from '@/lib/auth-client'
import { useAppStore } from '@/livestore/store'
import { trashLinks$ } from '@/livestore/queries'

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

  return (
    <div className='p-6'>
      <h1 className='text-2xl font-bold'>Trash</h1>
      <p className='text-muted-foreground mt-1 mb-6'>Deleted links. Empty after 30 days.</p>
      <LinkGrid links={links} emptyMessage='Trash is empty' />
    </div>
  )
}

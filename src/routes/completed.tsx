import { createFileRoute, Navigate } from '@tanstack/react-router'
import { LinkGrid } from '@/components/link-card'
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

  return (
    <div className='p-6'>
      <h1 className='text-2xl font-bold'>Completed</h1>
      <p className='text-muted-foreground mt-1 mb-6'>Links you've finished reading.</p>
      <LinkGrid links={links} emptyMessage='No completed links yet' />
    </div>
  )
}

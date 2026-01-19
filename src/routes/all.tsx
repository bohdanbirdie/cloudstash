import { createFileRoute, Navigate } from '@tanstack/react-router'
import { LinkGrid } from '@/components/link-card'
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

  return (
    <div className='p-6'>
      <h1 className='text-2xl font-bold'>All Links</h1>
      <p className='text-muted-foreground mt-1 mb-6'>Everything you've saved.</p>
      <LinkGrid links={links} emptyMessage='No links saved yet' />
    </div>
  )
}

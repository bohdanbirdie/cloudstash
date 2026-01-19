import { createFileRoute } from '@tanstack/react-router'
import { LinkGrid } from '@/components/link-card'
import { useAppStore } from '@/livestore/store'
import { inboxLinks$ } from '@/livestore/queries'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const store = useAppStore()
  const links = store.useQuery(inboxLinks$)

  return (
    <div className='p-6'>
      <h1 className='text-2xl font-bold'>Inbox</h1>
      <p className='text-muted-foreground mt-1 mb-6'>Links to read later.</p>
      <LinkGrid links={links} emptyMessage='No links in your inbox' />
    </div>
  )
}

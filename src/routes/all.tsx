import { createFileRoute } from '@tanstack/react-router'
import { LinkGrid } from '@/components/link-card'
import { useAppStore } from '@/livestore/store'
import { allLinks$ } from '@/livestore/queries'

export const Route = createFileRoute('/all')({
  component: AllLinksPage,
})

function AllLinksPage() {
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

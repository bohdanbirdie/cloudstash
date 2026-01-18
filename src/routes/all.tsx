import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/all')({
  component: AllLinksPage,
})

function AllLinksPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">All Links</h1>
      <p className="text-muted-foreground mt-1">Everything you've saved.</p>
    </div>
  )
}

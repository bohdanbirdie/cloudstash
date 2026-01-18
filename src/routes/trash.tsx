import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/trash')({
  component: TrashPage,
})

function TrashPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Trash</h1>
      <p className="text-muted-foreground mt-1">Deleted links. Empty after 30 days.</p>
    </div>
  )
}

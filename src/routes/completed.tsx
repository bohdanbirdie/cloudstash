import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/completed')({
  component: CompletedPage,
})

function CompletedPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Completed</h1>
      <p className="text-muted-foreground mt-1">Links you've finished reading.</p>
    </div>
  )
}

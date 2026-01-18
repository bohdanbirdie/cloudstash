import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Link Bucket</h1>
      <p className="text-muted-foreground">Your links will appear here.</p>
    </div>
  )
}
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Inbox</h1>
      <p className="text-muted-foreground mt-1">Links to read later.</p>
    </div>
  )
}
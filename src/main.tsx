import './styles.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'

import { AuthProvider, useAuth } from './lib/auth'
import { getRouter } from './router'
import { Spinner } from './components/ui/spinner'
import { PendingApproval } from './components/pending-approval'

const router = getRouter()

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function InnerApp() {
  const auth = useAuth()

  if (auth.isLoading) {
    return (
      <div className='flex h-screen w-screen items-center justify-center'>
        <Spinner className='size-8' />
      </div>
    )
  }

  // Show pending approval screen for unapproved users
  if (auth.userId && !auth.approved) {
    return <PendingApproval />
  }

  return <RouterProvider router={router} context={{ auth }} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <InnerApp />
    </AuthProvider>
  </StrictMode>,
)

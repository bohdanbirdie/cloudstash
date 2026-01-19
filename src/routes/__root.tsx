import { StoreRegistry } from '@livestore/livestore'
import { StoreRegistryProvider } from '@livestore/react'
import { createRootRouteWithContext, Outlet, useLocation, Navigate } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Suspense } from 'react'

import { AppSidebar } from '@/components/app-sidebar'
import { AddLinkDialogProvider } from '@/components/add-link-dialog'
import { authClient } from '@/lib/auth-client'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Spinner } from '@/components/ui/spinner'

type RouterContext = {
  storeRegistry: StoreRegistry
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  const { storeRegistry } = Route.useRouteContext()
  const { data: session, isPending } = authClient.useSession()
  const location = useLocation()

  const isLoginPage = location.pathname === '/login'

  if (isPending) {
    return (
      <div className='flex h-screen w-screen items-center justify-center'>
        <Spinner className='size-8' />
      </div>
    )
  }

  // Allow access to login page without authentication
  if (isLoginPage) {
    return <Outlet />
  }

  // Redirect to login if not authenticated
  if (!session) {
    return <Navigate to='/login' />
  }

  return (
    <StoreRegistryProvider storeRegistry={storeRegistry}>
      <Suspense
        fallback={
          <div className='flex h-screen w-screen items-center justify-center'>
            <Spinner className='size-8' />
          </div>
        }
      >
        <AddLinkDialogProvider>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <header className='flex h-14 shrink-0 items-center gap-2 border-b px-4'>
                <SidebarTrigger className='-ml-1' />
              </header>
              <main className='flex-1 overflow-auto'>
                <Outlet />
              </main>
            </SidebarInset>
            <TanStackRouterDevtools position='bottom-right' />
          </SidebarProvider>
        </AddLinkDialogProvider>
      </Suspense>
    </StoreRegistryProvider>
  )
}

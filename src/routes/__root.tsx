import { StoreRegistryProvider } from '@livestore/react'
import { createRootRouteWithContext, Outlet, redirect, useLocation } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Suspense } from 'react'

import { AppSidebar } from '@/components/app-sidebar'
import { AddLinkDialogProvider } from '@/components/add-link-dialog'
import { SearchCommand } from '@/components/search-command'
import { LinkDetailModal } from '@/components/link-card/link-detail-modal'
import { fetchAuth } from '@/lib/auth'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Spinner } from '@/components/ui/spinner'
import type { RouterContext } from '@/router'

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ location }) => {
    const auth = await fetchAuth()

    // Allow login page without auth
    if (location.pathname === '/login') {
      return { auth }
    }

    // Redirect to login if not authenticated
    if (!auth.isAuthenticated) {
      throw redirect({ to: '/login' })
    }

    return { auth }
  },
  component: RootComponent,
})

function RootComponent() {
  const { storeRegistry } = Route.useRouteContext()
  const location = useLocation()

  // Login page has minimal layout
  if (location.pathname === '/login') {
    return <Outlet />
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
            <SearchCommand />
            <LinkDetailModal />
            <TanStackRouterDevtools position='bottom-right' />
          </SidebarProvider>
        </AddLinkDialogProvider>
      </Suspense>
    </StoreRegistryProvider>
  )
}

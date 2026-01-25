import { StoreRegistryProvider } from '@livestore/react'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Suspense } from 'react'

import { AppSidebar } from '@/components/app-sidebar'
import { AddLinkDialogProvider } from '@/components/add-link-dialog'
import { SearchCommand } from '@/components/search-command'
import { LinkDetailModal } from '@/components/link-card/link-detail-modal'
import { ConnectionMonitor } from '@/livestore/store'
import { SyncErrorBanner } from '@/components/sync-error-banner'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Spinner } from '@/components/ui/spinner'

export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: '/login' })
    }
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  const { storeRegistry } = Route.useRouteContext()

  return (
    <StoreRegistryProvider storeRegistry={storeRegistry}>
      <Suspense
        fallback={
          <div className='flex h-screen w-screen items-center justify-center'>
            <Spinner className='size-8' />
          </div>
        }
      >
        <ConnectionMonitor />
        <AddLinkDialogProvider>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <SyncErrorBanner />
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

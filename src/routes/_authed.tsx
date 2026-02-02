import { StoreRegistryProvider } from "@livestore/react";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Suspense } from "react";
import { useDefaultLayout } from "react-resizable-panels";

import { AddLinkDialogProvider } from "@/components/add-link-dialog";
import { AppSidebar } from "@/components/app-sidebar";
import {
  ChatPanel,
  ChatPanelHandle,
  ChatPanelProvider,
} from "@/components/chat/chat-panel";
import { LinkDetailModal } from "@/components/link-card/link-detail-modal";
import { SearchCommand } from "@/components/search-command";
import { SyncErrorBanner } from "@/components/sync-error-banner";
import {
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { ConnectionMonitor } from "@/livestore/store";

export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: "/login" });
    }
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { storeRegistry } = Route.useRouteContext();
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "main-layout",
    storage: localStorage,
  });

  return (
    <StoreRegistryProvider storeRegistry={storeRegistry}>
      <Suspense
        fallback={
          <div className="flex h-screen w-screen items-center justify-center">
            <Spinner className="size-8" />
          </div>
        }
      >
        <ConnectionMonitor />
        <AddLinkDialogProvider>
          <ChatPanelProvider>
            <SidebarProvider className="!h-svh !min-h-0 overflow-hidden">
              <AppSidebar />
              <ResizablePanelGroup
                direction="horizontal"
                defaultLayout={defaultLayout}
                onLayoutChanged={onLayoutChanged}
                className="!h-svh !max-h-svh overflow-hidden"
              >
                <ResizablePanel id="main" defaultSize={100} minSize={50}>
                  <SidebarInset className="h-full overflow-hidden">
                    <SyncErrorBanner />
                    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
                      <SidebarTrigger className="-ml-1" />
                    </header>
                    <main className="flex-1 min-h-0 overflow-auto">
                      <Outlet />
                    </main>
                  </SidebarInset>
                </ResizablePanel>
                <ChatPanelHandle />
                <ChatPanel />
              </ResizablePanelGroup>
              <SearchCommand />
              <LinkDetailModal />
              <TanStackRouterDevtools position="bottom-right" />
            </SidebarProvider>
          </ChatPanelProvider>
        </AddLinkDialogProvider>
      </Suspense>
    </StoreRegistryProvider>
  );
}

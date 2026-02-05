import { StoreRegistryProvider } from "@livestore/react";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
// import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Suspense } from "react";

import { AddLinkDialogProvider } from "@/components/add-link-dialog";
import { AppSidebar } from "@/components/app-sidebar";
import { LinkDetailDialogProvider } from "@/components/link-detail-dialog";
import { useChatPanel } from "@/components/chat/chat-context";
import { ChatSheet } from "@/components/chat/chat-sheet";
import { ChatSheetProvider } from "@/components/chat/chat-sheet-provider";
import { SearchCommand } from "@/components/search-command";
import { SyncErrorBanner } from "@/components/sync-error-banner";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { useIsMobile } from "@/hooks/use-mobile";
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
  const isMobile = useIsMobile();

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
        <LinkDetailDialogProvider>
          <AddLinkDialogProvider>
            <ChatSheetProvider>
              <SidebarProvider className="!h-svh !min-h-0 overflow-hidden">
                <AppSidebar />
                <SidebarInset className="h-full overflow-hidden">
                  <SyncErrorBanner />
                  <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
                    <SidebarTrigger className="-ml-1" />
                  </header>
                  <main className="flex-1 min-h-0 overflow-auto">
                    <Outlet />
                  </main>
                </SidebarInset>
                <ContextualChatSheet isMobile={isMobile} />
                <SearchCommand />
                {/*{!isMobile && <TanStackRouterDevtools position="top-left" />}*/}
              </SidebarProvider>
            </ChatSheetProvider>
          </AddLinkDialogProvider>
        </LinkDetailDialogProvider>
      </Suspense>
    </StoreRegistryProvider>
  );
}

function ContextualChatSheet({ isMobile }: { isMobile: boolean }) {
  const { isOpen, close } = useChatPanel();
  return (
    <ChatSheet
      open={isOpen}
      onOpenChange={(open) => !open && close()}
      side={isMobile ? "bottom" : "right"}
    />
  );
}

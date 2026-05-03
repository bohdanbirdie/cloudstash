import { StoreRegistryProvider } from "@livestore/react";
import { FPSMeter } from "@overengineering/fps-meter";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Suspense } from "react";
import { HotkeysProvider } from "react-hotkeys-hook";

import { AddLinkDialogProvider } from "@/components/add-link-dialog";
import { useChatPanel } from "@/components/chat/chat-context";
import { ChatSheet } from "@/components/chat/chat-sheet";
import { ChatSheetProvider } from "@/components/chat/chat-sheet-provider";
import { CommandChip } from "@/components/command-chip/command-chip";
import { ListDataProvider } from "@/components/list-data-context";
import { LoadingScreen } from "@/components/loading-screen";
import { Masthead } from "@/components/masthead";
import { RightPane } from "@/components/right-pane/right-pane";
import { TagStrip } from "@/components/tag-strip";
import { TopBar } from "@/components/top-bar";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePageStaticData } from "@/hooks/use-page-static-data";
import { ConnectionMonitor } from "@/livestore/store";

export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: "/login" });
    }
  },
  validateSearch: (search: Record<string, unknown>): { tag?: string } => ({
    tag: typeof search.tag === "string" ? search.tag : undefined,
  }),
  component: AuthedLayout,
});

function AuthedLayout() {
  const { storeRegistry } = Route.useRouteContext();
  const isMobile = useIsMobile();

  return (
    <StoreRegistryProvider storeRegistry={storeRegistry}>
      <HotkeysProvider initiallyActiveScopes={["global"]}>
        <Suspense fallback={<LoadingScreen />}>
          <ConnectionMonitor />
          <AddLinkDialogProvider>
            <ChatSheetProvider>
              <ListDataProvider>
                <AuthedShell />
              </ListDataProvider>
              <ContextualChatSheet isMobile={isMobile} />
              <CommandChip />
              {import.meta.env.DEV && (
                <FPSMeter
                  className="fixed right-3 bottom-3 z-[9999] border border-gray-600 bg-black"
                  height={40}
                />
              )}
            </ChatSheetProvider>
          </AddLinkDialogProvider>
        </Suspense>
      </HotkeysProvider>
    </StoreRegistryProvider>
  );
}

function AuthedShell() {
  const { status } = usePageStaticData();

  if (status == null) {
    return (
      <div className="h-svh overflow-auto bg-background">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="h-svh overflow-auto bg-background">
      <div className="mx-auto max-w-7xl px-8 pt-16 pb-24">
        <TopBar />

        <div className="mt-14 grid grid-cols-[minmax(0,820px)_540px] items-start gap-x-10">
          <Masthead />
          <aside aria-hidden="true" />
        </div>

        <div className="mt-6">
          <TagStrip />
        </div>

        <div className="mt-6 h-px w-full bg-border" aria-hidden="true" />

        <div className="grid grid-cols-[minmax(0,820px)_540px] items-start gap-x-10">
          <div className="min-w-0">
            <Outlet />
          </div>
          <RightPane />
        </div>
      </div>
    </div>
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

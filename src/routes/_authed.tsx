import { StoreRegistryProvider } from "@livestore/react";
import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
} from "@tanstack/react-router";
import { Suspense } from "react";
import { HotkeysProvider } from "react-hotkeys-hook";

import { AddLinkDialogProvider } from "@/components/add-link-dialog";
import { useChatPanel } from "@/components/chat/chat-context";
import { ChatSheet } from "@/components/chat/chat-sheet";
import { ChatSheetProvider } from "@/components/chat/chat-sheet-provider";
import { LinkDetailDialogProvider } from "@/components/link-detail-dialog";
import { ListDataProvider } from "@/components/list-data-context";
import { LoadingScreen } from "@/components/loading-screen";
import { Masthead } from "@/components/masthead";
import { PageActionsProvider } from "@/components/page-actions-context";
import { PerfHUD } from "@/components/perf-hud";
import { SearchCommand } from "@/components/search-command";
import { TopBar } from "@/components/top-bar";
import { WeeklyDigest } from "@/components/weekly-digest";
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

const CATEGORY_PATHS: readonly string[] = ["/", "/all", "/completed", "/trash"];

function AuthedLayout() {
  const { storeRegistry } = Route.useRouteContext();
  const isMobile = useIsMobile();

  return (
    <StoreRegistryProvider storeRegistry={storeRegistry}>
      <HotkeysProvider initiallyActiveScopes={["global"]}>
        <Suspense fallback={<LoadingScreen />}>
          <ConnectionMonitor />
          <LinkDetailDialogProvider>
            <AddLinkDialogProvider>
              <ChatSheetProvider>
                <ListDataProvider>
                  <PageActionsProvider>
                    <AuthedShell />
                  </PageActionsProvider>
                </ListDataProvider>
                <ContextualChatSheet isMobile={isMobile} />
                <SearchCommand />
                {import.meta.env.DEV && <PerfHUD />}
              </ChatSheetProvider>
            </AddLinkDialogProvider>
          </LinkDetailDialogProvider>
        </Suspense>
      </HotkeysProvider>
    </StoreRegistryProvider>
  );
}

function AuthedShell() {
  const onCategoryRoute = CATEGORY_PATHS.includes(useLocation().pathname);

  if (!onCategoryRoute) {
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

        <div className="mt-6 h-px w-full bg-border" aria-hidden="true" />

        <div className="grid grid-cols-[minmax(0,820px)_540px] items-start gap-x-10">
          <div className="min-w-0">
            <Outlet />
          </div>
          <WeeklyDigest />
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

import { StoreRegistryProvider } from "@livestore/react";
import { FPSMeter } from "@overengineering/fps-meter";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Suspense } from "react";
import { HotkeysProvider } from "react-hotkeys-hook";

import { AddLinkDialogProvider } from "@/components/add-link-dialog";
import { BottomDock } from "@/components/bottom-dock/bottom-dock";
import { ListDataProvider } from "@/components/list-data-context";
import { LoadingScreen } from "@/components/loading-screen";
import { Masthead } from "@/components/masthead";
import { RightPane } from "@/components/right-pane/right-pane";
import { TagStrip } from "@/components/tag-strip";
import { TopBar } from "@/components/top-bar";
import { ScrollArea } from "@/components/ui/scroll-area";
// import { useIsMobile } from "@/hooks/use-mobile";
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

  return (
    <StoreRegistryProvider storeRegistry={storeRegistry}>
      <HotkeysProvider initiallyActiveScopes={["global"]}>
        <Suspense fallback={<LoadingScreen />}>
          <ConnectionMonitor />
          <AddLinkDialogProvider>
            <ListDataProvider>
              <AuthedShell />
            </ListDataProvider>
            <BottomDock />
            {import.meta.env.DEV && (
              <FPSMeter
                className="fixed left-3 top-3 z-[9999] border border-gray-600 bg-black"
                height={40}
              />
            )}
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
    <div className="h-svh overflow-hidden bg-background">
      <div className="mx-auto flex h-full max-w-7xl flex-col px-8 pt-6 pb-6">
        <TopBar />

        <div className="mt-6">
          <TagStrip />
        </div>

        <div className="mt-6 h-px w-full bg-border" aria-hidden="true" />

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,820px)_540px] gap-x-10">
          <div className="flex min-h-0 min-w-0 flex-col">
            <Masthead />
            <ScrollArea className="min-h-0 flex-1">
              <div className="px-3">
                <Outlet />
              </div>
            </ScrollArea>
          </div>
          <RightPane />
        </div>
      </div>
    </div>
  );
}

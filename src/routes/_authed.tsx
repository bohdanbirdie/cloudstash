import { StoreRegistryProvider } from "@livestore/react";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { HotkeysProvider } from "react-hotkeys-hook";

import { AddLinkProvider } from "@/components/add-link";
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
import { useInputMode } from "@/lib/input-mode";
import { ConnectionMonitor } from "@/livestore/store";

const DevToolsPanel = lazy(() =>
  import("@/components/dev-tools/dev-tools-panel").then((m) => ({
    default: m.DevToolsPanel,
  })),
);

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
  useInputMode();

  return (
    <StoreRegistryProvider storeRegistry={storeRegistry}>
      <HotkeysProvider initiallyActiveScopes={["global"]}>
        <Suspense fallback={<LoadingScreen />}>
          <ConnectionMonitor />
          <AddLinkProvider>
            <div className="bg-background flex h-svh flex-col">
              <div className="mx-auto flex h-full w-full min-h-0 max-w-7xl flex-col">
                <div className="min-h-0 flex-1 overflow-hidden">
                  <ListDataProvider>
                    <AuthedShell />
                  </ListDataProvider>
                </div>
                <div className="relative z-50 flex h-20 shrink-0 items-center justify-center">
                  <BottomDock />
                </div>
              </div>
            </div>
            {import.meta.env.DEV && (
              <Suspense fallback={null}>
                <DevToolsPanel />
              </Suspense>
            )}
          </AddLinkProvider>
        </Suspense>
      </HotkeysProvider>
    </StoreRegistryProvider>
  );
}

function AuthedShell() {
  const { status } = usePageStaticData();

  if (status == null) {
    return (
      <div className="h-full overflow-auto">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <div className="flex h-full flex-col px-8 pt-6 pb-6">
        <TopBar />

        <div className="mt-4 mb-2 px-2">
          <TagStrip />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,820px)_540px] gap-x-8">
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

import { StoreRegistryProvider } from "@livestore/react";
import { FPSMeter } from "@overengineering/fps-meter";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import {
  ActivityIcon,
  ArrowUpRightIcon,
  ChevronLeftIcon,
  WrenchIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { Suspense, useState } from "react";
import { HotkeysProvider } from "react-hotkeys-hook";

import { AddLinkProvider } from "@/components/add-link";
import { BottomDock } from "@/components/bottom-dock/bottom-dock";
import { ListDataProvider } from "@/components/list-data-context";
import { LoadingScreen } from "@/components/loading-screen";
import { Masthead } from "@/components/masthead";
import { RightPane } from "@/components/right-pane/right-pane";
import { TagStrip } from "@/components/tag-strip";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
// import { useIsMobile } from "@/hooks/use-mobile";
import { usePageStaticData } from "@/hooks/use-page-static-data";
import { useInputMode } from "@/lib/input-mode";
import { ConnectionMonitor } from "@/livestore/store";

const MOTEL_TRACES_URL = "http://127.0.0.1:27686/traces";

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
            {import.meta.env.DEV && <DevToolsPanel />}
          </AddLinkProvider>
        </Suspense>
      </HotkeysProvider>
    </StoreRegistryProvider>
  );
}

function DevToolsPanel() {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => setCollapsed(false)}
        className="bg-card/95 fixed bottom-3 left-3 z-40 shadow-md backdrop-blur"
        aria-label="Open dev tools"
      >
        <WrenchIcon />
      </Button>
    );
  }

  return (
    <div className="bg-card/95 border-border fixed bottom-3 left-3 z-40 flex items-center gap-1 rounded-md border p-1 shadow-md backdrop-blur">
      <DevToolsLink href={MOTEL_TRACES_URL} icon={ActivityIcon}>
        Traces
      </DevToolsLink>
      <Separator orientation="vertical" className="mx-0.5 h-5" />
      <FPSMeter
        className="border-border rounded-sm border bg-black"
        height={28}
      />
      <Separator orientation="vertical" className="mx-0.5 h-5" />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setCollapsed(true)}
        aria-label="Collapse dev tools"
      >
        <ChevronLeftIcon />
      </Button>
    </div>
  );
}

function DevToolsLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      render={
        <a href={href} target="_blank" rel="noopener noreferrer">
          <Icon />
          {children}
          <ArrowUpRightIcon className="size-3 opacity-60" aria-hidden="true" />
        </a>
      }
    />
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

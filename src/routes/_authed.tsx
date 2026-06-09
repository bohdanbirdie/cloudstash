import { StoreRegistryProvider } from "@livestore/react";
import {
  createFileRoute,
  Outlet,
  redirect,
  useMatchRoute,
} from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { HotkeysProvider } from "react-hotkeys-hook";

import { AddLinkProvider } from "@/components/add-link";
import { PaywallModal } from "@/components/billing/paywall-modal";
import { BottomDock } from "@/components/bottom-dock/bottom-dock";
import { ListDataProvider } from "@/components/list-data-context";
import { LoadingScreen } from "@/components/loading-screen";
import { Masthead } from "@/components/masthead";
import { PendingApproval } from "@/components/pending-approval";
import { MobileDetailSheet } from "@/components/right-pane/mobile-detail-sheet";
import { RightPane } from "@/components/right-pane/right-pane";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { TagStrip } from "@/components/tag-strip/tag-strip";
import { TopBar } from "@/components/top-bar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { YouTubePlayerHost } from "@/components/youtube-player-host";
import { usePageStaticData } from "@/hooks/use-page-static-data";
import { loadAuth, useAuth } from "@/lib/auth";
import { useInputMode } from "@/lib/input-mode";
import { openPaywallForIntent, parseUpgradeParam } from "@/lib/upgrade-intent";
import type { UpgradeParam } from "@/lib/upgrade-intent";
import { ConnectionMonitor } from "@/livestore/store";

const DevToolsPanel = lazy(() =>
  import("@/components/dev-tools/dev-tools-panel").then((m) => ({
    default: m.DevToolsPanel,
  }))
);

export const Route = createFileRoute("/_authed")({
  beforeLoad: async () => {
    const auth = await loadAuth();
    if (!auth) throw redirect({ to: "/login" });
    return { auth };
  },
  validateSearch: (
    search: Record<string, unknown>
  ): { tag?: string; upgrade?: UpgradeParam } => ({
    tag: typeof search.tag === "string" ? search.tag : undefined,
    upgrade: parseUpgradeParam(search.upgrade),
  }),
  loaderDeps: ({ search }) => ({ upgrade: search.upgrade }),
  loader: ({ context, deps, location }) => {
    if (!deps.upgrade || !context.auth.isAuthenticated) return;
    openPaywallForIntent(deps.upgrade);
    throw redirect({
      to: location.pathname,
      search: (prev) => ({ ...prev, upgrade: undefined }),
      replace: true,
    });
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const auth = useAuth();
  if (!auth.isAuthenticated) return <PendingApproval />;
  return <AuthedShellWrapper />;
}

function AuthedShellWrapper() {
  const { storeRegistry } = Route.useRouteContext();
  useInputMode();
  const matchRoute = useMatchRoute();
  const showDock = !matchRoute({ to: "/admin" });

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
                {showDock && (
                  <div className="relative z-50 flex h-20 shrink-0 items-center justify-center">
                    <BottomDock />
                  </div>
                )}
              </div>
            </div>
            <SettingsDialog />
            <PaywallModal />
            <MobileDetailSheet />
            <YouTubePlayerHost />
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
      <div className="flex h-full flex-col px-4 pt-4 pb-6 lg:px-8 lg:pt-6">
        <TopBar />

        <TagStrip status={status} />

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-x-8 lg:grid-cols-[minmax(0,820px)_540px]">
          <div className="flex min-h-0 min-w-0 flex-col">
            <Masthead />
            <ScrollArea className="min-h-0 flex-1">
              <div className="px-1 lg:px-3">
                <Outlet />
              </div>
            </ScrollArea>
          </div>
          {/* CSS-gated (Tailwind `lg` = min-width:1024px): crossing the
              boundary is a free visibility toggle, not a mount/unmount.
              The mobile sheet is hidden by the same `lg:` query, so the
              pane and sheet can never both show. */}
          <div className="hidden lg:contents">
            <RightPane />
          </div>
        </div>
      </div>
    </div>
  );
}

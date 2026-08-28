import { StoreRegistryProvider } from "@livestore/react";
import {
  createFileRoute,
  Outlet,
  redirect,
  useMatchRoute,
} from "@tanstack/react-router";
import { Option, Schema } from "effect";
import { lazy, Suspense } from "react";
import { HotkeysProvider } from "react-hotkeys-hook";
import { toast } from "sonner";

import { AddLinkProvider } from "@/components/add-link";
import {
  ApplicationFrame,
  LibraryLayout,
} from "@/components/application-layout";
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
import { SyncingTopBar, TopBar } from "@/components/top-bar";
import { YouTubePlayerHost } from "@/components/youtube-player-host";
import { usePageStaticData } from "@/hooks/use-page-static-data";
import { loadAuth, useAuth } from "@/lib/auth";
import { useInputMode } from "@/lib/input-mode";
import { openPaywallForIntent, parseUpgradeParam } from "@/lib/upgrade-intent";
import type { UpgradeParam } from "@/lib/upgrade-intent";
import { ConnectionMonitor } from "@/livestore/store";
import { useSettingsDialog } from "@/stores/settings-dialog-store";

const DevToolsPanel = lazy(() =>
  import("@/components/dev-tools/dev-tools-panel").then((m) => ({
    default: m.DevToolsPanel,
  }))
);

const IntegrationResult = Schema.Literal("x-connected");
type IntegrationResult = typeof IntegrationResult.Type;
const decodeIntegrationResult = Schema.decodeUnknownOption(IntegrationResult);

const parseIntegrationResult = (
  value: unknown
): IntegrationResult | undefined =>
  Option.getOrUndefined(decodeIntegrationResult(value));

export const Route = createFileRoute("/_authed")({
  beforeLoad: async () => {
    const auth = await loadAuth();
    if (!auth) throw redirect({ to: "/login" });
    return { auth };
  },
  validateSearch: (
    search: Record<string, unknown>
  ): {
    integrationResult?: IntegrationResult;
    tag?: string;
    upgrade?: UpgradeParam;
  } => ({
    integrationResult: parseIntegrationResult(search.integrationResult),
    tag: typeof search.tag === "string" ? search.tag : undefined,
    upgrade: parseUpgradeParam(search.upgrade),
  }),
  loaderDeps: ({ search }) => ({
    integrationResult: search.integrationResult,
    upgrade: search.upgrade,
  }),
  loader: ({ context, deps, location }) => {
    if (!context.auth.isAuthenticated) return;
    if (deps.integrationResult === "x-connected") {
      useSettingsDialog.getState().openAt("integrations");
      toast.success("X connected", {
        description: "New bookmarks will sync automatically.",
      });
      throw redirect({
        to: location.pathname,
        search: (prev) => ({ ...prev, integrationResult: undefined }),
        replace: true,
      });
    }
    if (!deps.upgrade) return;
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
  const isAdmin = Boolean(matchRoute({ to: "/admin" }));

  return (
    <StoreRegistryProvider storeRegistry={storeRegistry}>
      <HotkeysProvider initiallyActiveScopes={["global"]}>
        <ApplicationFrame
          dock={
            isAdmin ? undefined : (
              <Suspense fallback={null}>
                <BottomDock />
              </Suspense>
            )
          }
        >
          {isAdmin ? (
            <Outlet />
          ) : (
            <Suspense fallback={<LibrarySyncingShell />}>
              <ConnectionMonitor />
              <AddLinkProvider>
                <ListDataProvider>
                  <AuthedShell />
                </ListDataProvider>
              </AddLinkProvider>
            </Suspense>
          )}
        </ApplicationFrame>
        <Suspense fallback={null}>
          <SettingsDialog />
        </Suspense>
        <PaywallModal />
        {isAdmin ? null : (
          <>
            <Suspense fallback={null}>
              <MobileDetailSheet />
            </Suspense>
            <YouTubePlayerHost />
            {import.meta.env.DEV && (
              <Suspense fallback={null}>
                <DevToolsPanel />
              </Suspense>
            )}
          </>
        )}
      </HotkeysProvider>
    </StoreRegistryProvider>
  );
}

function LibrarySyncingShell() {
  return (
    <LibraryLayout
      topBar={<SyncingTopBar />}
      masthead={null}
      rightPane={null}
      loadingState={
        <LoadingScreen className="h-full" animationClassName="size-20" />
      }
    >
      {null}
    </LibraryLayout>
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
    <LibraryLayout
      topBar={<TopBar />}
      tagStrip={<TagStrip status={status} />}
      masthead={<Masthead />}
      rightPane={<RightPane />}
    >
      <Outlet />
    </LibraryLayout>
  );
}

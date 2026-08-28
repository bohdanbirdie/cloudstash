import { StoreRegistry } from "@livestore/livestore";
import { createRouter } from "@tanstack/react-router";

import { AccountLoadingScreen } from "./components/loading-screen";
import type { LinkStatus } from "./livestore/queries/filtered-links";
import { routeTree } from "./routeTree.gen";

export interface RouterContext {
  storeRegistry: StoreRegistry;
}

export const getRouter = () => {
  const storeRegistry = new StoreRegistry();

  return createRouter({
    context: { storeRegistry },
    // Auth-gated routes await `loadAuth()` in `beforeLoad`. While that's
    // pending, TSR shows this component after its standard debounce. Public
    // routes have no `beforeLoad` and render immediately.
    defaultPendingComponent: AccountLoadingScreen,
    defaultPreloadStaleTime: 0,
    routeTree,
    scrollRestoration: true,
  });
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
  interface StaticDataRouteOption {
    icon?: string;
    title?: string;
    noun?: string;
    status?: LinkStatus;
    emptyMessage?: string;
  }
}

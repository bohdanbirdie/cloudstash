import { StoreRegistry } from "@livestore/livestore";
import { createRouter } from "@tanstack/react-router";

import { type AuthState } from "./lib/auth";
import { routeTree } from "./routeTree.gen";

export interface RouterContext {
  storeRegistry: StoreRegistry;
  auth: AuthState;
}

export const getRouter = () => {
  const storeRegistry = new StoreRegistry();

  return createRouter({
    context: {
      auth: undefined!,
      storeRegistry, // Provided by AuthProvider at runtime
    },
    defaultPreloadStaleTime: 0,
    routeTree,
    scrollRestoration: true,
  });
};

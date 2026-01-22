import { StoreRegistry } from '@livestore/livestore'
import { createRouter } from '@tanstack/react-router'

import type { AuthState } from './lib/auth'
import { routeTree } from './routeTree.gen'

export type RouterContext = {
  storeRegistry: StoreRegistry
  auth: AuthState
}

export const getRouter = () => {
  const storeRegistry = new StoreRegistry()

  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    context: {
      storeRegistry,
      // TODO: not sure this is correct
      auth: { userId: null, orgId: null, jwt: null, isAuthenticated: false },
    },
  })
}

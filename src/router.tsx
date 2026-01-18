import { StoreRegistry } from '@livestore/livestore'
import { createRouter } from '@tanstack/react-router'

import { routeTree } from './routeTree.gen'

export const getRouter = () => {
  const storeRegistry = new StoreRegistry()

  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    context: {
      storeRegistry,
    },
  })
}

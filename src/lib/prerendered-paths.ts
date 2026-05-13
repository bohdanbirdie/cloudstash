import type { FileRoutesByFullPath } from "@/routeTree.gen";

// `satisfies` ties the list to TSR's generated route map: renaming or removing
// a route in `src/routes/` regenerates `FileRoutesByFullPath` and fails the
// build here, so we can't ship a prerender pointing at a vanished path.
export const PRERENDERED_PATHS = [
  "/",
  "/privacy",
  "/terms",
  "/contact",
] as const satisfies readonly (keyof FileRoutesByFullPath)[];

export type PrerenderedPath = (typeof PRERENDERED_PATHS)[number];

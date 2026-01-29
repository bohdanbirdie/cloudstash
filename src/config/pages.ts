import { type LucideIcon } from "lucide-react";

import { getIcon } from "@/lib/icons";

export interface Page {
  path: string;
  title: string;
  icon: string;
  Icon: LucideIcon | undefined;
}

interface RouteWithStaticData {
  fullPath: string;
  options?: { staticData?: { title: string; icon: string } };
  children?: Record<string, RouteWithStaticData>;
}

export function buildPages(routeTreeChildren: object | undefined): Page[] {
  if (!routeTreeChildren) {
    return [];
  }

  const pages: Page[] = [];

  function traverse(routes: Record<string, RouteWithStaticData>) {
    for (const route of Object.values(routes)) {
      const staticData = route.options?.staticData;
      if (staticData) {
        pages.push({
          Icon: getIcon(staticData.icon),
          icon: staticData.icon,
          path: route.fullPath,
          title: staticData.title,
        });
      }
      if (route.children) {
        traverse(route.children);
      }
    }
  }

  traverse(routeTreeChildren as Record<string, RouteWithStaticData>);
  return pages;
}

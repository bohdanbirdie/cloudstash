import { useMatches } from "@tanstack/react-router";
import type { StaticDataRouteOption } from "@tanstack/react-router";

export function usePageStaticData(): StaticDataRouteOption {
  return useMatches({
    select: (matches) => matches[matches.length - 1]?.staticData ?? {},
  });
}

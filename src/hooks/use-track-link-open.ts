import { useCallback } from "react";

import { track } from "@/lib/analytics";
import { useRecentLinksStore } from "@/stores/recent-links-store";

export function useTrackLinkOpen() {
  const addLink = useRecentLinksStore((s) => s.addLink);
  return useCallback(
    (linkId: string) => {
      track("link_opened");
      addLink(linkId);
    },
    [addLink]
  );
}

import { useCallback } from "react";

import { track } from "@/lib/analytics";

export function useTrackLinkOpen() {
  return useCallback((linkId: string) => {
    track("link_opened");
  }, []);
}

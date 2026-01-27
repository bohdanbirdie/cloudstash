import { useCallback } from "react";

import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";

export function useTrackLinkOpen() {
  const store = useAppStore();

  return useCallback(
    (linkId: string) => {
      store.commit(
        events.linkInteracted({
          id: crypto.randomUUID(),
          linkId,
          occurredAt: new Date(),
          type: "opened",
        })
      );
    },
    [store]
  );
}

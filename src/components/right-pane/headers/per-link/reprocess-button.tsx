import { RefreshCwIcon } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { SharedTooltipTrigger } from "@/components/ui/shared-tooltip";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { linkProcessingStatus$ } from "@/livestore/queries/links";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";

export function ReprocessButton({ linkId }: { linkId: string }) {
  const { role } = useAuth();
  const store = useAppStore();
  const processingQuery = useMemo(
    () => linkProcessingStatus$(linkId),
    [linkId]
  );
  const processingRecord = store.useQuery(processingQuery);

  if (role !== "admin") return null;

  const isProcessing = processingRecord?.status === "pending";
  const isReprocessing = processingRecord?.status === "reprocess-requested";
  const busy = isProcessing || isReprocessing;

  const handleReprocess = () => {
    store.commit(
      events.linkReprocessRequested({
        linkId,
        requestedAt: new Date(),
      })
    );
  };

  return (
    <SharedTooltipTrigger
      payload="Reprocess"
      render={
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={handleReprocess}
          disabled={busy}
          aria-label="Reprocess"
        >
          <RefreshCwIcon className={cn(busy && "animate-spin")} />
        </Button>
      }
    />
  );
}

import { motion } from "motion/react";
import { useState } from "react";

import { ActivityGrid } from "@/components/activity-grid/activity-grid";
import { DetailView } from "@/components/right-pane/detail-view";
import { RightPaneHeader } from "@/components/right-pane/right-pane-header";
import { PopoverBoundaryProvider } from "@/components/ui/popover-boundary";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRightPaneStore } from "@/stores/right-pane-store";
import { useInSelectionMode } from "@/stores/selection-store";

const HEADER_SLOT_HEIGHT = 48;

export function RightPane() {
  const activeLinkId = useRightPaneStore((s) => s.activeLinkId);
  const hasSelection = useInSelectionMode();
  const slotActive = !!activeLinkId || hasSelection;
  const [boundaryEl, setBoundaryEl] = useState<HTMLElement | null>(null);

  return (
    <aside
      ref={setBoundaryEl}
      aria-label={activeLinkId ? "Link details" : "Activity"}
      className="flex h-full min-h-0 flex-col"
    >
      <PopoverBoundaryProvider value={boundaryEl}>
        <motion.div
          initial={false}
          animate={{ height: slotActive ? HEADER_SLOT_HEIGHT : 0 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          className="relative shrink-0 overflow-hidden bg-background"
        >
          <RightPaneHeader />
        </motion.div>

        <div className="relative min-h-0 flex-1">
          <div className="flex flex-col gap-8 pr-2 pb-8">
            <ActivityGrid />
          </div>

          {activeLinkId && (
            <div className="absolute inset-0 bg-background">
              <ScrollArea className="h-full">
                <DetailView linkId={activeLinkId} />
              </ScrollArea>
            </div>
          )}
        </div>
      </PopoverBoundaryProvider>
    </aside>
  );
}

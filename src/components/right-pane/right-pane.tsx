import { motion } from "motion/react";

import { PerfProfiler } from "@/components/perf-hud";
import { useRightPaneState } from "@/components/right-pane-context";
import { DetailView } from "@/components/right-pane/detail-view";
import { RightPaneHeader } from "@/components/right-pane/right-pane-header";
import { HEADER_SLOT_HEIGHT } from "@/components/right-pane/right-pane-header-slot";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WeeklyDigest } from "@/components/weekly-digest";
import { useInSelectionMode } from "@/stores/selection-store";

export function RightPane() {
  const { activeLinkId } = useRightPaneState();
  const hasSelection = useInSelectionMode();
  const slotActive = !!activeLinkId || hasSelection;

  return (
    <aside
      aria-label={activeLinkId ? "Link details" : "This week's digest"}
      className="sticky top-0 flex h-svh flex-col self-start"
    >
      <motion.div
        initial={false}
        animate={{ height: slotActive ? HEADER_SLOT_HEIGHT : 0 }}
        transition={{ duration: 0.12, ease: "easeOut" }}
        className="relative shrink-0 overflow-hidden bg-background"
      >
        <RightPaneHeader />
      </motion.div>

      <div className="relative min-h-0 flex-1">
        <WeeklyDigest />

        {activeLinkId && (
          <div className="absolute inset-0 bg-background">
            <ScrollArea className="h-full">
              <PerfProfiler id="DetailView">
                <DetailView linkId={activeLinkId} />
              </PerfProfiler>
            </ScrollArea>
          </div>
        )}
      </div>
    </aside>
  );
}

import { AnimatePresence, motion } from "motion/react";

import { useRightPaneState } from "@/components/right-pane-context";
import { BulkActionHeader } from "@/components/right-pane/bulk-action-header";
import { PerLinkHeader } from "@/components/right-pane/per-link-header";

export function RightPaneHeader() {
  const { activeLinkId } = useRightPaneState();

  return (
    <>
      <AnimatePresence initial={false}>
        {activeLinkId && (
          <motion.div
            key="per-link"
            initial={{ opacity: 0, filter: "blur(4px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(4px)" }}
            transition={{ duration: 0.12 }}
            className="absolute inset-0"
          >
            <PerLinkHeader linkId={activeLinkId} />
          </motion.div>
        )}
      </AnimatePresence>
      <BulkActionHeader />
    </>
  );
}

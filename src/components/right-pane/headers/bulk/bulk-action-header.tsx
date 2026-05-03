import { DownloadIcon, XIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";

import { ExportDialog } from "@/components/export-dialog";
import { BulkTagPicker } from "@/components/right-pane/headers/bulk/tag-picker";
import { useSelectionHotkey } from "@/components/right-pane/headers/bulk/use-selection-hotkeys";
import {
  ACTION_META,
  pageBulkToggle,
} from "@/components/right-pane/headers/page-actions";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useHotkeyScope } from "@/hooks/use-hotkey-scope";
import { usePageStaticData } from "@/hooks/use-page-static-data";
import { linksByIds$ } from "@/livestore/queries/links";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";
import { useSelectionStore } from "@/stores/selection-store";

export function BulkActionHeader() {
  const store = useAppStore();
  const selectedIds = useSelectionStore((s) => s.ids);
  const clear = useSelectionStore((s) => s.clear);
  const count = selectedIds.size;
  const { status } = usePageStaticData();
  const [exportOpen, setExportOpen] = useState(false);

  useHotkeyScope("selection", { enabled: count > 0 });

  const { primary, secondary } = pageBulkToggle(status);
  const primaryMeta = primary ? ACTION_META[primary] : null;
  const secondaryMeta = ACTION_META[secondary];
  const PrimaryIcon = primaryMeta?.icon;
  const SecondaryIcon = secondaryMeta.icon;

  const selectedIdsArray = useMemo(() => [...selectedIds], [selectedIds]);

  const handlePrimary = () => {
    if (!primary) return;
    let eventsToCommit;
    if (primary === "uncomplete") {
      eventsToCommit = selectedIdsArray.map((id) =>
        events.linkUncompleted({ id })
      );
    } else {
      const completedAt = new Date();
      const existing = store.query(linksByIds$(selectedIdsArray));
      const alreadyCompleted = new Set(
        existing.filter((l) => l.status === "completed").map((l) => l.id)
      );
      eventsToCommit = selectedIdsArray
        .filter((id) => !alreadyCompleted.has(id))
        .map((id) => events.linkCompleted({ completedAt, id }));
    }
    if (eventsToCommit.length > 0) store.commit(...eventsToCommit);
    clear();
  };

  const handleSecondary = () => {
    let eventsToCommit;
    if (secondary === "restore") {
      eventsToCommit = selectedIdsArray.map((id) =>
        events.linkRestored({ id })
      );
    } else {
      const deletedAt = new Date();
      eventsToCommit = selectedIdsArray.map((id) =>
        events.linkDeleted({ deletedAt, id })
      );
    }
    if (eventsToCommit.length > 0) store.commit(...eventsToCommit);
    clear();
  };

  useSelectionHotkey("escape", clear, count > 0);
  useSelectionHotkey(
    "meta+enter",
    handlePrimary,
    count > 0 && primary !== null
  );
  useSelectionHotkey("meta+backspace", handleSecondary, count > 0);
  useSelectionHotkey("meta+e", () => setExportOpen(true), count > 0);

  return (
    <>
      <AnimatePresence initial={false}>
        {count > 0 && (
          <motion.div
            key="bulk"
            initial={{ opacity: 0, filter: "blur(4px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(4px)" }}
            transition={{ duration: 0.12 }}
            className="absolute inset-0 z-30 flex items-center justify-between gap-2 bg-background pt-3 pb-2 pr-2"
          >
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold text-primary tabular-nums">
                {count} selected
              </span>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={clear}
                      aria-label="Clear selection"
                    >
                      <XIcon />
                    </Button>
                  }
                />
                <TooltipContent>Clear</TooltipContent>
              </Tooltip>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                {primaryMeta && PrimaryIcon && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handlePrimary}
                    aria-label={primaryMeta.label}
                  >
                    <PrimaryIcon />
                    <span>{primaryMeta.label}</span>
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleSecondary}
                  aria-label={secondaryMeta.label}
                >
                  <SecondaryIcon />
                  <span>{secondaryMeta.label}</span>
                </Button>
              </div>

              <div className="flex items-center gap-1">
                <BulkTagPicker selectedIds={selectedIds} />

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setExportOpen(true)}
                        aria-label="Export"
                      >
                        <DownloadIcon />
                      </Button>
                    }
                  />
                  <TooltipContent>Export</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {exportOpen && (
        <ExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          ids={selectedIdsArray}
          pageTitle={`${count} selected`}
        />
      )}
    </>
  );
}

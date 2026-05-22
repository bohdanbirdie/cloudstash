import { DownloadIcon, XIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";

import { ExportDialog } from "@/components/export-dialog";
import { BulkTagPicker } from "@/components/right-pane/headers/bulk/tag-picker";
import { ACTION_META } from "@/components/right-pane/headers/page-actions";
import type { LinkAction } from "@/components/right-pane/headers/page-actions";
import { Button } from "@/components/ui/button";
import {
  SharedTooltipProvider,
  SharedTooltipTrigger,
} from "@/components/ui/shared-tooltip";
import { useHotkeyScope } from "@/hooks/use-hotkey-scope";
import { useCommand, useDismiss } from "@/lib/keyboard";
import { linksByIds$ } from "@/livestore/queries/links";
import type { LinkWithDetails } from "@/livestore/queries/schemas";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";
import { useSelectionStore } from "@/stores/selection-store";

const READ_ACTIONS: readonly LinkAction[] = ["complete", "uncomplete"];
const ARCHIVE_ACTIONS: readonly LinkAction[] = ["archive", "restore"];

function eligibleIds(links: readonly LinkWithDetails[], action: LinkAction) {
  switch (action) {
    case "complete":
      return links.filter((l) => l.status !== "completed").map((l) => l.id);
    case "uncomplete":
      return links.filter((l) => l.status === "completed").map((l) => l.id);
    case "archive":
      return links.filter((l) => l.deletedAt === null).map((l) => l.id);
    case "restore":
      return links.filter((l) => l.deletedAt !== null).map((l) => l.id);
  }
}

function buildEvents(action: LinkAction, ids: readonly string[]) {
  switch (action) {
    case "complete": {
      const completedAt = new Date();
      return ids.map((id) => events.linkCompleted({ completedAt, id }));
    }
    case "uncomplete":
      return ids.map((id) => events.linkUncompleted({ id }));
    case "archive": {
      const deletedAt = new Date();
      return ids.map((id) => events.linkDeleted({ deletedAt, id }));
    }
    case "restore":
      return ids.map((id) => events.linkRestored({ id }));
  }
}

export function BulkActionHeader() {
  const store = useAppStore();
  const selectedIds = useSelectionStore((s) => s.ids);
  const clear = useSelectionStore((s) => s.clear);
  const count = selectedIds.size;
  const [exportOpen, setExportOpen] = useState(false);

  useHotkeyScope("selection", { enabled: count > 0 });

  const selectedIdsArray = useMemo(() => [...selectedIds], [selectedIds]);

  const runAction = (action: LinkAction) => {
    const links = store.query(linksByIds$(selectedIdsArray));
    const ids = eligibleIds(links, action);
    if (ids.length > 0) store.commit(...buildEvents(action, ids));
    clear();
  };

  useDismiss("selection", clear);
  useCommand("bulkPrimary", () => runAction("complete"));
  useCommand("bulkSecondary", () => runAction("archive"));
  useCommand("bulkExport", () => setExportOpen(true));

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
            className="absolute inset-0 z-30 flex items-center justify-between gap-2 bg-background pt-1.5 pb-2 px-3"
          >
            <SharedTooltipProvider>
              <div className="flex items-center gap-1">
                <span className="text-xs font-semibold text-primary tabular-nums">
                  {count} selected
                </span>
                <SharedTooltipTrigger
                  payload="Clear"
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
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  {READ_ACTIONS.map((action) => {
                    const meta = ACTION_META[action];
                    const Icon = meta.icon;
                    return (
                      <Button
                        key={action}
                        size="sm"
                        variant="ghost"
                        onClick={() => runAction(action)}
                        aria-label={meta.label}
                      >
                        <Icon />
                        <span>{meta.label}</span>
                      </Button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-1">
                  {ARCHIVE_ACTIONS.map((action) => {
                    const meta = ACTION_META[action];
                    const Icon = meta.icon;
                    return (
                      <Button
                        key={action}
                        size="sm"
                        variant={action === "archive" ? "destructive" : "ghost"}
                        onClick={() => runAction(action)}
                        aria-label={meta.label}
                      >
                        <Icon />
                        <span>{meta.label}</span>
                      </Button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-1">
                  <BulkTagPicker selectedIds={selectedIds} />

                  <ExportButton onOpen={() => setExportOpen(true)} />
                </div>
              </div>
            </SharedTooltipProvider>
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

function ExportButton({ onOpen }: { onOpen: () => void }) {
  return (
    <SharedTooltipTrigger
      payload="Export"
      render={
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onOpen}
          aria-label="Export"
        >
          <DownloadIcon />
        </Button>
      }
    />
  );
}

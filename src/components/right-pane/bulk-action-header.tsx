import { useLocation } from "@tanstack/react-router";
import {
  CheckIcon,
  DownloadIcon,
  PlusIcon,
  TagIcon,
  Trash2Icon,
  UndoIcon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import slugify from "slugify";

import { ExportDialog } from "@/components/export-dialog";
import { usePageActions } from "@/components/page-actions-context";
import { Button } from "@/components/ui/button";
import { HotkeyButton } from "@/components/ui/hotkey-button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useHotkeyScope } from "@/hooks/use-hotkey-scope";
import { cn } from "@/lib/utils";
import { allTags$, tagsByLink$ } from "@/livestore/queries/tags";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";
import { useSelectionStore } from "@/stores/selection-store";

export function BulkActionHeader() {
  const store = useAppStore();
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const clear = useSelectionStore((s) => s.clear);
  const count = selectedIds.size;
  const pathname = useLocation().pathname;
  const { exportAction } = usePageActions();
  const [exportOpen, setExportOpen] = useState(false);

  useHotkeyScope("selection", { enabled: count > 0 });

  const isCompleted = pathname === "/completed";
  const isArchive = pathname === "/archive";
  const showComplete = !isArchive;

  const selectedLinks = useMemo(() => {
    if (!exportAction) return [];
    return exportAction.links.filter((l) => selectedIds.has(l.id));
  }, [exportAction, selectedIds]);

  const handleComplete = () => {
    const eventsToCommit = isCompleted
      ? [...selectedIds].map((id) => events.linkUncompleted({ id }))
      : (() => {
          const completedAt = new Date();
          return [...selectedIds].map((id) =>
            events.linkCompleted({ completedAt, id })
          );
        })();
    if (eventsToCommit.length > 0) store.commit(...eventsToCommit);
    clear();
  };

  const handleArchive = () => {
    const eventsToCommit = isArchive
      ? [...selectedIds].map((id) => events.linkRestored({ id }))
      : (() => {
          const deletedAt = new Date();
          return [...selectedIds].map((id) =>
            events.linkDeleted({ deletedAt, id })
          );
        })();
    if (eventsToCommit.length > 0) store.commit(...eventsToCommit);
    clear();
  };

  const handleExport = () => setExportOpen(true);

  useHotkeys("escape", clear, {
    enabled: count > 0,
    enableOnFormTags: ["option"],
    preventDefault: true,
    scopes: ["selection"],
  });
  useHotkeys("meta+enter", handleComplete, {
    enabled: count > 0 && showComplete,
    enableOnFormTags: ["option"],
    preventDefault: true,
    scopes: ["selection"],
  });
  useHotkeys("meta+backspace", handleArchive, {
    enabled: count > 0,
    enableOnFormTags: ["option"],
    preventDefault: true,
    scopes: ["selection"],
  });
  useHotkeys("meta+e", handleExport, {
    enabled: count > 0,
    enableOnFormTags: ["option"],
    preventDefault: true,
    scopes: ["selection"],
  });

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
                {showComplete && (
                  <HotkeyButton
                    size="sm"
                    variant="ghost"
                    onClick={handleComplete}
                    onHotkeyPress={handleComplete}
                    aria-label={isCompleted ? "Reopen" : "Complete"}
                    hotkey="meta+enter"
                    hotkeyEnabled={false}
                    scope="selection"
                  >
                    {isCompleted ? <UndoIcon /> : <CheckIcon />}
                    <span>{isCompleted ? "Reopen" : "Complete"}</span>
                  </HotkeyButton>
                )}

                <HotkeyButton
                  size="sm"
                  variant="ghost"
                  onClick={handleArchive}
                  onHotkeyPress={handleArchive}
                  aria-label={isArchive ? "Restore" : "Archive"}
                  hotkey="meta+backspace"
                  hotkeyEnabled={false}
                  scope="selection"
                >
                  {isArchive ? <UndoIcon /> : <Trash2Icon />}
                  <span>{isArchive ? "Restore" : "Archive"}</span>
                </HotkeyButton>
              </div>

              <div className="flex items-center gap-1">
                <BulkTagPicker selectedIds={selectedIds} />

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={handleExport}
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
          links={selectedLinks}
          pageTitle={`${count} selected`}
        />
      )}
    </>
  );
}

type BulkTagItem =
  | { type: "tag"; tag: { id: string; name: string; sortOrder: number } }
  | { type: "create" };

function BulkTagPicker({ selectedIds }: { selectedIds: Set<string> }) {
  const store = useAppStore();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const allTags = store.useQuery(allTags$);
  const tagsByLinkRows = store.useQuery(tagsByLink$);

  useHotkeyScope("popover", {
    enabled: open,
    disableScopes: ["dialog", "selection"],
  });

  const existingPairs = useMemo(() => {
    const pairs = new Set<string>();
    for (const row of tagsByLinkRows) {
      if (selectedIds.has(row.linkId)) {
        pairs.add(`${row.linkId}:${row.id}`);
      }
    }
    return pairs;
  }, [tagsByLinkRows, selectedIds]);

  const filteredTags = useMemo(() => {
    if (!inputValue.trim()) return allTags;
    const query = inputValue.toLowerCase();
    return allTags.filter((t) => t.name.toLowerCase().includes(query));
  }, [allTags, inputValue]);

  const canCreateTag = useMemo(() => {
    if (!inputValue.trim()) return false;
    const slug = slugify(inputValue.trim(), { lower: true, strict: true });
    return slug.length > 0 && !allTags.some((t) => t.id === slug);
  }, [inputValue, allTags]);

  const items: BulkTagItem[] = useMemo(() => {
    const list: BulkTagItem[] = filteredTags.map((t) => ({
      type: "tag",
      tag: t,
    }));
    if (canCreateTag) list.push({ type: "create" });
    return list;
  }, [filteredTags, canCreateTag]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [items.length]);

  useEffect(() => {
    if (!open) {
      setInputValue("");
      setHighlightedIndex(0);
    }
  }, [open]);

  const applyTag = (tagId: string) => {
    const createdAt = new Date();
    const eventsToCommit = [...selectedIds]
      .filter((linkId) => !existingPairs.has(`${linkId}:${tagId}`))
      .map((linkId) =>
        events.linkTagged({
          createdAt,
          id: `${linkId}-${tagId}`,
          linkId,
          tagId,
        })
      );
    if (eventsToCommit.length > 0) store.commit(...eventsToCommit);
    setOpen(false);
  };

  const createTagAndApply = () => {
    const name = inputValue.trim();
    if (!name) return;
    const id = slugify(name, { lower: true, strict: true });
    if (!id || allTags.some((t) => t.id === id)) return;

    const createdAt = new Date();
    const maxSortOrder = Math.max(0, ...allTags.map((t) => t.sortOrder));

    store.commit(
      events.tagCreated({
        createdAt,
        id,
        name,
        sortOrder: maxSortOrder + 1,
      }),
      ...[...selectedIds].map((linkId) =>
        events.linkTagged({
          createdAt,
          id: `${linkId}-${id}`,
          linkId,
          tagId: id,
        })
      )
    );
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[highlightedIndex];
      if (!item) return;
      if (item.type === "create") createTagAndApply();
      else applyTag(item.tag.id);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button size="icon-sm" variant="ghost" aria-label="Add tag">
                  <TagIcon />
                </Button>
              }
            />
          }
        />
        <TooltipContent>Add tag</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-56 p-0">
        <div className="p-2">
          <Input
            autoFocus
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search or create tag..."
            className="h-8"
          />
        </div>
        <div className="max-h-48 overflow-y-auto">
          {items.length === 0 && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              {allTags.length === 0 ? "No tags yet" : "No tags found"}
            </div>
          )}
          {items.map((item, index) => {
            if (item.type === "create") {
              return (
                <button
                  key="__create__"
                  type="button"
                  onClick={createTagAndApply}
                  className={cn(
                    "flex w-full items-center gap-2 px-2 py-1.5 text-xs text-primary hover:bg-muted/50",
                    index === highlightedIndex && "bg-muted/50"
                  )}
                >
                  <PlusIcon className="h-4 w-4" />
                  Create &quot;#{inputValue.trim()}&quot;
                </button>
              );
            }
            const { tag } = item;
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => applyTag(tag.id)}
                className={cn(
                  "flex w-full items-center gap-2 px-2 py-1.5 text-xs text-foreground hover:bg-muted/50",
                  index === highlightedIndex && "bg-muted/50"
                )}
              >
                <span className="font-medium">#{tag.name}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

import { PlusIcon, SparklesIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { ItemRow } from "@/components/tags/tag-combobox/item-row";
import type { SnapshotEntry } from "@/components/tags/tag-combobox/suggestion-row";
import { SuggestionRow } from "@/components/tags/tag-combobox/suggestion-row";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePopoverBoundary } from "@/components/ui/popover-boundary";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useHotkeyScope } from "@/hooks/use-hotkey-scope";
import {
  deriveNewTag,
  MAX_TAG_NAME_LENGTH,
  sanitizeTagName,
  suggestionTagId,
} from "@/lib/tags";
import { cn } from "@/lib/utils";
import type { TagSuggestion } from "@/livestore/queries/schemas";
import type { Tag } from "@/livestore/queries/tags";
import { allTags$ } from "@/livestore/queries/tags";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";

interface TagComboboxProps {
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  allowCreate?: boolean;
  placeholder?: string;
  className?: string;
  suggestions?: readonly TagSuggestion[];
  onAcceptSuggestion?: (suggestion: TagSuggestion) => void;
  onDismissSuggestion?: (suggestion: TagSuggestion) => void;
}

export function TagCombobox({
  selectedTagIds,
  onChange,
  allowCreate = true,
  placeholder = "Search tags...",
  className,
  suggestions,
  onAcceptSuggestion,
  onDismissSuggestion,
}: TagComboboxProps) {
  const store = useAppStore();
  const allTags = store.useQuery(allTags$);
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [orderSnapshot, setOrderSnapshot] = useState<string[]>([]);
  const [cmdValue, setCmdValue] = useState("");
  const [snapshot, setSnapshot] = useState<SnapshotEntry[]>([]);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const boundary = usePopoverBoundary();

  useHotkeys(
    "arrowup,arrowdown,home,end,enter",
    (e) => {
      const popup = popupRef.current;
      if (!popup || popup.contains(document.activeElement)) return;
      const input = popup.querySelector<HTMLInputElement>(
        '[data-slot="command-input"]'
      );
      if (!input) return;
      e.preventDefault();
      input.focus();
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: e.key,
          code: e.code,
          bubbles: true,
          cancelable: true,
        })
      );
    },
    { scopes: ["popover"], enabled: isOpen }
  );

  useHotkeyScope("popover", {
    enabled: isOpen,
    disableScopes: ["dialog", "selection"],
  });

  const selectedSet = new Set(selectedTagIds);
  const selectedTags = allTags.filter((t) => selectedSet.has(t.id));
  const pendingSuggestions = suggestions ?? [];
  const hasSuggestions = pendingSuggestions.length > 0;
  const searchQuery = sanitizeTagName(inputValue);
  const matchesQuery = (tag: Tag) =>
    !searchQuery || tag.id.includes(searchQuery);
  const newTag = allowCreate
    ? deriveNewTag(inputValue, new Set(allTags.map((t) => t.id)))
    : null;

  const byId = new Map(allTags.map((t) => [t.id, t]));
  const knownIds = new Set(orderSnapshot);
  const orderedTags = [
    ...orderSnapshot.flatMap((id) => byId.get(id) ?? []),
    ...allTags.filter((t) => !knownIds.has(t.id)),
  ];

  const acceptedSuggestionTagIds = new Set(
    snapshot
      .filter((e) => e.state === "accepted")
      .map((e) => suggestionTagId(e.suggestion))
  );

  const visibleTags = orderedTags.filter(
    (t) => matchesQuery(t) && !acceptedSuggestionTagIds.has(t.id)
  );

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      const sorted = allTags.toSorted((a, b) => a.name.localeCompare(b.name));
      const selected = sorted.filter((t) => selectedSet.has(t.id));
      const unselected = sorted.filter((t) => !selectedSet.has(t.id));
      setOrderSnapshot([...selected, ...unselected].map((t) => t.id));
      setSnapshot(
        pendingSuggestions.map((s) => ({ suggestion: s, state: "pending" }))
      );
    }
  };

  const handleOpenChangeComplete = (open: boolean) => {
    if (open) return;
    setOrderSnapshot([]);
    setInputValue("");
    setCmdValue("");
    setSnapshot([]);
  };

  const setEntryState = (id: string, state: SnapshotEntry["state"]) => {
    setSnapshot((prev) =>
      prev.map((entry) =>
        entry.suggestion.id === id ? { ...entry, state } : entry
      )
    );
  };

  const acceptSuggestion = (s: TagSuggestion, closeAfter: boolean) => {
    onAcceptSuggestion?.(s);
    setEntryState(s.id, "accepted");
    if (closeAfter) setIsOpen(false);
  };

  const dismissSuggestion = (s: TagSuggestion) => {
    onDismissSuggestion?.(s);
    setEntryState(s.id, "dismissed");
  };

  const toggleTag = (tagId: string) => {
    onChange(
      selectedSet.has(tagId)
        ? selectedTagIds.filter((id) => id !== tagId)
        : [...selectedTagIds, tagId]
    );
  };

  const createTag = () => {
    if (!newTag) return;
    store.commit(
      events.tagCreated({
        createdAt: new Date(),
        id: newTag.id,
        name: newTag.name,
        sortOrder: (allTags.at(-1)?.sortOrder ?? 0) + 1,
      })
    );
    onChange([...selectedTagIds, newTag.id]);
    setOrderSnapshot((prev) => [newTag.id, ...prev]);
    setInputValue("");
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === " " && inputValue === "") {
      e.preventDefault();
      e.currentTarget.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
      return;
    }

    if (e.key !== "Delete") return;

    if (cmdValue.startsWith("s-")) {
      const id = cmdValue.slice(2);
      const entry = snapshot.find((x) => x.suggestion.id === id);
      if (entry?.state !== "pending") return;
      e.preventDefault();
      dismissSuggestion(entry.suggestion);
      return;
    }

    if (cmdValue.startsWith("t-")) {
      const tagId = cmdValue.slice(2);
      if (!selectedSet.has(tagId)) return;
      e.preventDefault();
      toggleTag(tagId);
    }
  };

  return (
    <Popover
      open={isOpen}
      onOpenChange={handleOpenChange}
      onOpenChangeComplete={handleOpenChangeComplete}
    >
      <div
        className={cn(
          "relative flex flex-wrap items-center gap-1.5",
          className
        )}
      >
        <span
          ref={anchorRef}
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0"
        />
        {selectedTags.map((tag) => (
          <PopoverTrigger
            key={tag.id}
            render={
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground whitespace-nowrap transition-colors hover:text-foreground outline-none focus-visible:text-foreground"
              />
            }
          >
            #{tag.name}
          </PopoverTrigger>
        ))}
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="outline"
                    aria-label={
                      hasSuggestions
                        ? `Edit tags (${pendingSuggestions.length} suggested)`
                        : selectedTags.length > 0
                          ? "Edit tags"
                          : "Add tags"
                    }
                    className="relative"
                  />
                }
              >
                <PlusIcon />
                {hasSuggestions && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary"
                  />
                )}
              </PopoverTrigger>
            }
          />
          <TooltipContent>
            {hasSuggestions
              ? `${pendingSuggestions.length} tag suggestion${pendingSuggestions.length === 1 ? "" : "s"}`
              : selectedTags.length > 0
                ? "Edit tags"
                : "Add tags"}
          </TooltipContent>
        </Tooltip>
      </div>

      <PopoverContent
        ref={popupRef}
        anchor={anchorRef}
        collisionBoundary={boundary ?? "clipping-ancestors"}
        collisionPadding={24}
        align="start"
        className="w-64 p-0"
      >
        <Command
          shouldFilter={false}
          value={cmdValue}
          onValueChange={setCmdValue}
        >
          <CommandInput
            autoFocus
            value={inputValue}
            onValueChange={setInputValue}
            onKeyDown={handleInputKeyDown}
            placeholder={placeholder}
            maxLength={MAX_TAG_NAME_LENGTH}
          />
          <CommandList className="h-48">
            {newTag && (
              <CommandGroup>
                <CommandItem value="__create__" onSelect={createTag}>
                  <PlusIcon className="size-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    Create{" "}
                    <span className="font-medium text-foreground">
                      #{newTag.name}
                    </span>
                  </span>
                  <Kbd className="ml-auto">↵</Kbd>
                </CommandItem>
              </CommandGroup>
            )}

            {snapshot.length > 0 && (
              <CommandGroup
                heading={
                  <span className="flex items-center gap-1.5">
                    <SparklesIcon className="size-3" />
                    Suggestions
                  </span>
                }
              >
                {snapshot.map((entry) => (
                  <SuggestionRow
                    key={`s-${entry.suggestion.id}`}
                    entry={entry}
                    selectedSet={selectedSet}
                    allTags={allTags}
                    acceptSuggestion={acceptSuggestion}
                    dismissSuggestion={dismissSuggestion}
                    toggleTag={toggleTag}
                    onClose={() => setIsOpen(false)}
                  />
                ))}
              </CommandGroup>
            )}

            {snapshot.length > 0 && visibleTags.length > 0 && (
              <CommandSeparator />
            )}

            {visibleTags.length > 0 && (
              <CommandGroup>
                {visibleTags.map((tag) => (
                  <ItemRow
                    key={`t-${tag.id}`}
                    value={`t-${tag.id}`}
                    name={tag.name}
                    selected={selectedSet.has(tag.id)}
                    onPrimary={() => {
                      toggleTag(tag.id);
                      setIsOpen(false);
                    }}
                    onSecondary={() => toggleTag(tag.id)}
                    checkboxAriaLabel={
                      selectedSet.has(tag.id)
                        ? `Deselect #${tag.name}`
                        : `Select #${tag.name}`
                    }
                  />
                ))}
              </CommandGroup>
            )}

            {!newTag && visibleTags.length === 0 && snapshot.length === 0 && (
              <div className="py-6 text-center text-xs text-muted-foreground">
                {allTags.length === 0 ? "No tags yet" : "No tags match"}
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

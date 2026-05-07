import { CheckIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import {
  createPopoverHandle,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePopoverBoundary } from "@/components/ui/popover-boundary";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useHotkeyScope } from "@/hooks/use-hotkey-scope";
import { deriveNewTag, MAX_TAG_NAME_LENGTH, sanitizeTagName } from "@/lib/tags";
import { cn } from "@/lib/utils";
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
}

function TagRow({
  tag,
  isSelected,
  isHighlighted,
  onHighlight,
  onSelect,
}: {
  tag: Tag;
  isSelected: boolean;
  isHighlighted: boolean;
  onHighlight: () => void;
  onSelect: (closeAfter: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 text-xs",
        isHighlighted && "bg-muted/50"
      )}
    >
      <button
        type="button"
        aria-pressed={isSelected}
        aria-label={
          isSelected ? `Deselect #${tag.name}` : `Select #${tag.name}`
        }
        tabIndex={-1}
        onMouseEnter={onHighlight}
        onClick={() => onSelect(false)}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors",
          isSelected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-background"
        )}
      >
        {isSelected && <CheckIcon className="size-3" strokeWidth={2.5} />}
      </button>
      <button
        type="button"
        tabIndex={-1}
        onMouseEnter={onHighlight}
        onClick={() => onSelect(true)}
        className="flex-1 text-left font-medium"
      >
        #{tag.name}
      </button>
    </div>
  );
}

export function TagCombobox({
  selectedTagIds,
  onChange,
  allowCreate = true,
  placeholder = "Search tags...",
  className,
}: TagComboboxProps) {
  const store = useAppStore();
  const allTags = store.useQuery(allTags$);
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [orderSnapshot, setOrderSnapshot] = useState<string[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const handle = useMemo(() => createPopoverHandle(), []);
  const boundary = usePopoverBoundary();

  useHotkeyScope("popover", {
    enabled: isOpen,
    disableScopes: ["dialog", "selection"],
  });

  const selectedSet = new Set(selectedTagIds);
  const selectedTags = allTags.filter((t) => selectedSet.has(t.id));
  const searchQuery = sanitizeTagName(inputValue);
  const matchesQuery = (tag: Tag) =>
    !searchQuery || tag.id.includes(searchQuery);
  const newTag = allowCreate
    ? deriveNewTag(inputValue, new Set(allTags.map((t) => t.id)))
    : null;

  const orderedTags = useMemo(() => {
    if (!orderSnapshot) return allTags;
    const byId = new Map(allTags.map((t) => [t.id, t]));
    const known = orderSnapshot.flatMap((id) => {
      const t = byId.get(id);
      return t ? [t] : [];
    });
    const knownIds = new Set(orderSnapshot);
    const newcomers = allTags.filter((t) => !knownIds.has(t.id));
    return [...known, ...newcomers];
  }, [orderSnapshot, allTags]);

  const hasMatches = orderedTags.some(matchesQuery);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      const sorted = allTags.toSorted((a, b) => a.name.localeCompare(b.name));
      const selected = sorted.filter((t) => selectedSet.has(t.id));
      const unselected = sorted.filter((t) => !selectedSet.has(t.id));
      setOrderSnapshot([...selected, ...unselected].map((t) => t.id));
    }
  };

  const handleOpenChangeComplete = (open: boolean) => {
    if (open) return;
    setOrderSnapshot(null);
    setInputValue("");
    setHighlightedId(null);
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
    setInputValue("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") {
      return;
    }
    e.preventDefault();

    if (e.key === "Enter" && newTag) {
      createTag();
      return;
    }

    const visibleTags = orderedTags.filter(matchesQuery);
    if (visibleTags.length === 0) return;

    if (e.key === "Enter") {
      const tag =
        visibleTags.find((t) => t.id === highlightedId) ?? visibleTags[0];
      toggleTag(tag.id);
      return;
    }

    const currentIdx = visibleTags.findIndex((t) => t.id === highlightedId);
    const dir = e.key === "ArrowDown" ? 1 : -1;
    const n = visibleTags.length;
    const nextIdx = currentIdx === -1 ? 0 : (currentIdx + dir + n) % n;
    setHighlightedId(visibleTags[nextIdx].id);
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {selectedTags.map((tag) => (
        <PopoverTrigger
          key={tag.id}
          handle={handle}
          id={`tag-${tag.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground whitespace-nowrap transition-colors hover:text-foreground outline-none focus-visible:text-foreground"
        >
          #{tag.name}
        </PopoverTrigger>
      ))}
      <PopoverTrigger
        handle={handle}
        id="add-tag"
        render={
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={selectedTags.length > 0 ? "Edit tags" : "Add tags"}
          >
            <PlusIcon />
          </Button>
        }
      />

      <Popover
        handle={handle}
        open={isOpen}
        onOpenChange={handleOpenChange}
        onOpenChangeComplete={handleOpenChangeComplete}
      >
        <PopoverContent
          collisionBoundary={boundary ?? "clipping-ancestors"}
          collisionPadding={8}
          align="start"
          className="w-64 gap-1 p-0"
        >
          <div className="p-2">
            <InputGroup>
              <InputGroupAddon align="inline-start">
                <InputGroupText>
                  <SearchIcon className="size-3.5" />
                </InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                ref={inputRef}
                autoFocus
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                maxLength={MAX_TAG_NAME_LENGTH}
              />
            </InputGroup>
          </div>

          <div className="flex h-60 flex-col">
            {newTag && (
              <button
                type="button"
                onClick={createTag}
                className="flex shrink-0 items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50"
              >
                <PlusIcon className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">
                  Create{" "}
                  <span className="font-medium text-foreground">
                    #{newTag.name}
                  </span>
                </span>
                <Kbd className="ml-auto">↵</Kbd>
              </button>
            )}

            <ScrollArea className="min-h-0 flex-1">
              {allTags.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  No tags yet
                </p>
              ) : !hasMatches ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  No tags match your search
                </p>
              ) : (
                orderedTags.map((tag) => (
                  <div key={tag.id} hidden={!matchesQuery(tag)}>
                    <TagRow
                      tag={tag}
                      isSelected={selectedSet.has(tag.id)}
                      isHighlighted={tag.id === highlightedId}
                      onHighlight={() => setHighlightedId(tag.id)}
                      onSelect={(closeAfter) => {
                        toggleTag(tag.id);
                        if (closeAfter) setIsOpen(false);
                      }}
                    />
                  </div>
                ))
              )}
            </ScrollArea>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

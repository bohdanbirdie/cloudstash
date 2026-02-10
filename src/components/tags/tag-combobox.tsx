import { PlusIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import slugify from "slugify";

import { TagBadge } from "@/components/tags/tag-badge";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useHotkeyScope } from "@/hooks/use-hotkey-scope";
import { getTagColor, tagColorStyles } from "@/lib/tag-colors";
import { cn } from "@/lib/utils";
import { allTags$, tagCounts$ } from "@/livestore/queries/tags";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";

type TagItem = {
  type: "tag";
  tag: { id: string; name: string; sortOrder: number };
};

type CreateItem = {
  type: "create";
};

type ListItem = TagItem | CreateItem;

interface TagComboboxProps {
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  allowCreate?: boolean;
  placeholder?: string;
  className?: string;
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
  const tagCounts = store.useQuery(tagCounts$);
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useHotkeyScope("popover", {
    enabled: isOpen,
    disableScopes: ["dialog", "selection"],
  });

  const selectedTags = useMemo(
    () => allTags.filter((t) => selectedTagIds.includes(t.id)),
    [allTags, selectedTagIds]
  );

  const availableTags = useMemo(
    () => allTags.filter((t) => !selectedTagIds.includes(t.id)),
    [allTags, selectedTagIds]
  );

  const filteredTags = useMemo(() => {
    if (!inputValue.trim()) return availableTags;
    const query = inputValue.toLowerCase();
    return availableTags.filter((t) => t.name.toLowerCase().includes(query));
  }, [availableTags, inputValue]);

  const canCreateTag = useMemo(() => {
    if (!allowCreate || !inputValue.trim()) return false;
    const slug = slugify(inputValue.trim(), { lower: true, strict: true });
    return slug.length > 0 && !allTags.some((t) => t.id === slug);
  }, [allowCreate, inputValue, allTags]);

  const items: ListItem[] = useMemo(() => {
    const list: ListItem[] = filteredTags.map((t) => ({
      type: "tag",
      tag: t,
    }));
    if (canCreateTag) {
      list.push({ type: "create" });
    }
    return list;
  }, [filteredTags, canCreateTag]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [items.length]);

  useEffect(() => {
    if (!isOpen) {
      setInputValue("");
      setHighlightedIndex(0);
    }
  }, [isOpen]);

  const getCountForTag = (tagId: string) =>
    tagCounts.find((tc) => tc.tagId === tagId)?.count ?? 0;

  const handleCreateTag = () => {
    const name = inputValue.trim();
    if (!name) return;

    const id = slugify(name, { lower: true, strict: true });
    const maxSortOrder = Math.max(0, ...allTags.map((t) => t.sortOrder));

    store.commit(
      events.tagCreated({
        createdAt: new Date(),
        id,
        name,
        sortOrder: maxSortOrder + 1,
      })
    );

    onChange([...selectedTagIds, id]);
    setInputValue("");
  };

  const handleSelectTag = (tagId: string) => {
    onChange([...selectedTagIds, tagId]);
    setInputValue("");
    inputRef.current?.focus();
  };

  const handleRemoveTag = (tagId: string) => {
    onChange(selectedTagIds.filter((id) => id !== tagId));
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
      if (item.type === "create") {
        handleCreateTag();
      } else {
        handleSelectTag(item.tag.id);
      }
    }
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {selectedTags.map((tag) => (
        <TagBadge
          key={tag.id}
          name={tag.name}
          onRemove={() => handleRemoveTag(tag.id)}
        />
      ))}

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger className="inline-flex h-5 w-5 items-center justify-center bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors">
          <PlusIcon className="h-3 w-3" />
        </PopoverTrigger>

        <PopoverContent className="w-56 p-0">
          <div className="p-2">
            <Input
              ref={inputRef}
              autoFocus
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="h-8"
            />
          </div>

          <div className="max-h-48 overflow-y-auto">
            {items.length === 0 && (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                No tags found
              </div>
            )}

            {items.map((item, index) => {
              if (item.type === "create") {
                return (
                  <button
                    key="__create__"
                    type="button"
                    onClick={handleCreateTag}
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
              const color = getTagColor(tag.name);
              const styles = tagColorStyles[color];
              const count = getCountForTag(tag.id);

              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => handleSelectTag(tag.id)}
                  className={cn(
                    "flex w-full items-center gap-2 px-2 py-1.5 text-xs hover:bg-muted/50",
                    index === highlightedIndex && "bg-muted/50"
                  )}
                >
                  <span className={cn("px-1.5 py-0.5", styles.badge)}>
                    #{tag.name}
                  </span>
                  <span className="ml-auto text-muted-foreground">
                    {count} {count === 1 ? "link" : "links"}
                  </span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

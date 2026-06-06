import { useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon, SparklesIcon } from "lucide-react";
import { useRef, useState } from "react";

import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePopoverBoundary } from "@/components/ui/popover-boundary";
import { useHotkeyScope } from "@/hooks/use-hotkey-scope";
import { cn } from "@/lib/utils";
import type { TagWithCount } from "@/livestore/queries/schemas";
import { useSelectionStore } from "@/stores/selection-store";

interface TagFilterMenuProps {
  tags: readonly TagWithCount[];
  suggestionTags: readonly TagWithCount[];
  activeTag: string | null;
  overflow: readonly TagWithCount[];
  onApply?: (id: string) => void;
}

export function TagFilterMenu({
  tags,
  suggestionTags,
  activeTag,
  overflow,
  onApply,
}: TagFilterMenuProps) {
  const navigate = useNavigate();
  const clearSelection = useSelectionStore((s) => s.clear);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const anchorRef = useRef<HTMLSpanElement>(null);
  const boundary = usePopoverBoundary();

  useHotkeyScope("popover", {
    enabled: isOpen,
    disableScopes: ["dialog", "selection"],
  });

  if (overflow.length === 0 && suggestionTags.length === 0) {
    return null;
  }

  const q = query.trim().toLowerCase();
  const matches = (t: TagWithCount) => t.name.toLowerCase().includes(q);
  const searchPool = q ? tags : overflow;
  const listTags = searchPool.filter(matches);
  const listSuggestions = suggestionTags.filter(matches);

  const setTag = (id: string | null) => {
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, tag: id ?? undefined }),
    });
    clearSelection();
    setIsOpen(false);
    if (id) onApply?.(id);
  };

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setQuery("");
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="More tags"
            data-tag-more=""
            className="relative inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-sm text-foreground/40 outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
        }
      >
        <span
          ref={anchorRef}
          aria-hidden
          className="pointer-events-none absolute inset-0"
        />
        <span>
          {overflow.length > 0 ? `${overflow.length} more` : "Suggested"}
        </span>
        <ChevronDownIcon aria-hidden className="size-3 shrink-0 opacity-50" />
      </PopoverTrigger>

      <PopoverContent
        anchor={anchorRef}
        collisionBoundary={boundary ?? "clipping-ancestors"}
        collisionPadding={24}
        align="end"
        className="w-60 p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Filter tags..."
          />
          <CommandList className="max-h-72">
            {listTags.length > 0 && (
              <CommandGroup>
                {listTags.map((tag) => (
                  <CommandItem
                    key={tag.id}
                    value={tag.id}
                    onSelect={() =>
                      setTag(tag.id === activeTag ? null : tag.id)
                    }
                  >
                    <span
                      className={cn(
                        "truncate",
                        tag.id === activeTag && "text-primary"
                      )}
                    >
                      #{tag.name}
                    </span>
                    <span className="ml-auto tabular-nums text-muted-foreground/70">
                      {tag.count}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {listTags.length > 0 && listSuggestions.length > 0 && (
              <CommandSeparator />
            )}

            {listSuggestions.length > 0 && (
              <CommandGroup
                heading={
                  <span className="flex items-center gap-1.5">
                    <SparklesIcon className="size-3" />
                    Suggested
                  </span>
                }
              >
                {listSuggestions.map((tag) => (
                  <CommandItem
                    key={`s-${tag.id}`}
                    value={`s-${tag.id}`}
                    onSelect={() =>
                      setTag(tag.id === activeTag ? null : tag.id)
                    }
                  >
                    <span
                      className={cn(
                        "truncate",
                        tag.id === activeTag && "text-primary"
                      )}
                    >
                      #{tag.name}
                    </span>
                    <span className="ml-auto tabular-nums text-muted-foreground/70">
                      {tag.count}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {listTags.length === 0 && listSuggestions.length === 0 && (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No tags match
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

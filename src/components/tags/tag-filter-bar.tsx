import { FilterIcon, PlusIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTagFilter } from "@/hooks/use-tag-filter";
import { track } from "@/lib/analytics";
import { getTagColor, tagColorStyles } from "@/lib/tag-colors";
import { cn } from "@/lib/utils";
import { allTags$, tagCounts$ } from "@/livestore/queries/tags";
import { useAppStore } from "@/livestore/store";

interface TagFilterBarProps {
  totalCount: number;
  filteredCount: number;
}

export function TagFilterBar({ totalCount, filteredCount }: TagFilterBarProps) {
  const store = useAppStore();
  const allTags = store.useQuery(allTags$);
  const tagCounts = store.useQuery(tagCounts$);
  const {
    tags,
    untagged,
    hasFilters,
    addTag,
    removeTag,
    setUntagged,
    clearFilters,
  } = useTagFilter();
  const [open, setOpen] = useState(false);

  const selectedTags = useMemo(
    () => allTags.filter((t) => tags.includes(t.id)),
    [allTags, tags]
  );

  const availableTags = useMemo(
    () => allTags.filter((t) => !tags.includes(t.id)),
    [allTags, tags]
  );

  const getCountForTag = (tagId: string) =>
    tagCounts.find((tc) => tc.tagId === tagId)?.count ?? 0;

  const handleSelectTag = (tagId: string) => {
    addTag(tagId);
    setOpen(false);
    track("tag_filter_applied", { type: "tag" });
  };

  const handleToggleUntagged = () => {
    setUntagged(!untagged);
    setOpen(false);
    track("tag_filter_applied", { type: "untagged" });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <FilterIcon className="h-4 w-4" />
        <span>Filter:</span>
      </div>

      {selectedTags.map((tag) => {
        const color = getTagColor(tag.name);
        const styles = tagColorStyles[color];
        return (
          <span
            key={tag.id}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium",
              styles.badge
            )}
          >
            #{tag.name}
            <button
              type="button"
              onClick={() => removeTag(tag.id)}
              className="rounded-sm opacity-60 hover:opacity-100"
              aria-label={`Remove ${tag.name} filter`}
            >
              <XIcon className="h-3 w-3" />
            </button>
          </span>
        );
      })}

      {untagged && (
        <span className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium bg-muted text-muted-foreground">
          Untagged
          <button
            type="button"
            onClick={() => setUntagged(false)}
            className="rounded-sm opacity-60 hover:opacity-100"
            aria-label="Remove untagged filter"
          >
            <XIcon className="h-3 w-3" />
          </button>
        </span>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
              <PlusIcon className="h-3 w-3" />
              Add filter
            </Button>
          }
        />
        <PopoverContent className="w-56 p-0" align="start">
          <div className="max-h-60 overflow-y-auto">
            {!untagged && (
              <button
                type="button"
                onClick={handleToggleUntagged}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  Untagged
                </span>
              </button>
            )}

            {!untagged && availableTags.length > 0 && (
              <div className="my-1 h-px bg-border" />
            )}

            {availableTags.map((tag) => {
              const color = getTagColor(tag.name);
              const styles = tagColorStyles[color];
              const count = getCountForTag(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => handleSelectTag(tag.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <span
                    className={cn(
                      "rounded-sm px-1.5 py-0.5 text-xs",
                      styles.badge
                    )}
                  >
                    #{tag.name}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {count}
                  </span>
                </button>
              );
            })}

            {availableTags.length === 0 && untagged && (
              <div className="py-3 text-center text-sm text-muted-foreground">
                No more filters available
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {hasFilters && (
        <>
          <span className="text-xs text-muted-foreground ml-2">
            Showing {filteredCount} of {totalCount}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear all
          </Button>
        </>
      )}
    </div>
  );
}

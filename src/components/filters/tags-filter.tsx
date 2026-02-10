import { TagIcon } from "lucide-react";
import { useMemo } from "react";

import { FilterChip } from "@/components/filters/filter-chip";
import {
  FilterDropdown,
  FilterDropdownCheckboxItem,
  FilterDropdownSeparator,
} from "@/components/filters/filter-dropdown";
import { useTagFilter } from "@/hooks/use-tag-filter";
import { track } from "@/lib/analytics";
import { getTagColor, tagColorStyles } from "@/lib/tag-colors";
import { cn } from "@/lib/utils";
import { allTags$, tagCounts$ } from "@/livestore/queries/tags";
import { useAppStore } from "@/livestore/store";

export function TagsFilterDropdown() {
  const store = useAppStore();
  const allTags = store.useQuery(allTags$);
  const tagCounts = store.useQuery(tagCounts$);
  const { tags, untagged, addTag, removeTag, setUntagged } = useTagFilter();

  const hasActiveFilters = tags.length > 0 || untagged;

  const getCountForTag = (tagId: string) =>
    tagCounts.find((tc) => tc.tagId === tagId)?.count ?? 0;

  const handleToggleTag = (tagId: string) => {
    if (tags.includes(tagId)) {
      removeTag(tagId);
    } else {
      addTag(tagId);
      track("tag_filter_applied", { type: "tag" });
    }
  };

  const handleToggleUntagged = () => {
    setUntagged(!untagged);
    if (!untagged) {
      track("tag_filter_applied", { type: "untagged" });
    }
  };

  return (
    <FilterDropdown
      label="Tags"
      icon={<TagIcon className="h-4 w-4" />}
      hasActiveFilters={hasActiveFilters}
    >
      <FilterDropdownCheckboxItem
        checked={untagged}
        onCheckedChange={handleToggleUntagged}
      >
        <span className="h-2 w-2 rounded-full bg-gray-400 ring-1 ring-white" />
        <span className="text-muted-foreground">Untagged</span>
      </FilterDropdownCheckboxItem>

      {allTags.length > 0 && <FilterDropdownSeparator />}

      {allTags.map((tag) => {
        const color = getTagColor(tag.name);
        const styles = tagColorStyles[color];
        const count = getCountForTag(tag.id);
        const isSelected = tags.includes(tag.id);

        return (
          <FilterDropdownCheckboxItem
            key={tag.id}
            checked={isSelected}
            onCheckedChange={() => handleToggleTag(tag.id)}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full ring-1 ring-white",
                styles.dot
              )}
            />
            <span>{tag.name}</span>
            <span className="ml-auto text-muted-foreground">{count}</span>
          </FilterDropdownCheckboxItem>
        );
      })}

      {allTags.length === 0 && (
        <div className="py-3 text-center text-sm text-muted-foreground">
          No tags yet
        </div>
      )}
    </FilterDropdown>
  );
}

export function TagsFilterChips() {
  const store = useAppStore();
  const allTags = store.useQuery(allTags$);
  const { tags, untagged, removeTag, setUntagged } = useTagFilter();

  const selectedTags = useMemo(
    () => allTags.filter((t) => tags.includes(t.id)),
    [allTags, tags]
  );

  return (
    <>
      {selectedTags.map((tag) => {
        const color = getTagColor(tag.name);
        const styles = tagColorStyles[color];
        return (
          <FilterChip
            key={tag.id}
            onRemove={() => removeTag(tag.id)}
            className={styles.badge}
            ariaLabel={`Remove ${tag.name} filter`}
          >
            #{tag.name}
          </FilterChip>
        );
      })}

      {untagged && (
        <FilterChip
          onRemove={() => setUntagged(false)}
          ariaLabel="Remove untagged filter"
        >
          Untagged
        </FilterChip>
      )}
    </>
  );
}

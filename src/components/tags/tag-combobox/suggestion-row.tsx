import { XIcon } from "lucide-react";

import { ItemRow } from "@/components/tags/tag-combobox/item-row";
import { Button } from "@/components/ui/button";
import { suggestionTagId } from "@/lib/tags";
import type { TagSuggestion } from "@/livestore/queries/schemas";
import type { Tag } from "@/livestore/queries/tags";

export type SnapshotEntry = {
  suggestion: TagSuggestion;
  state: "pending" | "accepted" | "dismissed";
};

interface SuggestionRowProps {
  entry: SnapshotEntry;
  selectedSet: Set<string>;
  allTags: readonly Tag[];
  acceptSuggestion: (suggestion: TagSuggestion, closeAfter: boolean) => void;
  dismissSuggestion: (suggestion: TagSuggestion) => void;
  toggleTag: (tagId: string) => void;
  onClose: () => void;
}

export function SuggestionRow({
  entry,
  selectedSet,
  allTags,
  acceptSuggestion,
  dismissSuggestion,
  toggleTag,
  onClose,
}: SuggestionRowProps) {
  const { suggestion, state } = entry;
  const value = `s-${suggestion.id}`;

  if (state === "dismissed") {
    return (
      <div className="flex min-h-7 items-center gap-2 px-2.5 py-1.5 text-xs/relaxed text-muted-foreground opacity-50">
        <span className="size-4 shrink-0" />
        <span className="font-medium">#{suggestion.suggestedName}</span>
      </div>
    );
  }

  if (state === "accepted") {
    const tagId = suggestionTagId(suggestion);
    const tag = allTags.find((t) => t.id === tagId);
    const displayName = tag?.name ?? suggestion.suggestedName;
    const isSelected = selectedSet.has(tagId);
    return (
      <ItemRow
        value={value}
        name={displayName}
        selected={isSelected}
        onPrimary={() => {
          toggleTag(tagId);
          onClose();
        }}
        onSecondary={() => toggleTag(tagId)}
        checkboxAriaLabel={
          isSelected ? `Deselect #${displayName}` : `Select #${displayName}`
        }
      />
    );
  }

  return (
    <ItemRow
      value={value}
      name={suggestion.suggestedName}
      selected={false}
      onPrimary={() => acceptSuggestion(suggestion, true)}
      onSecondary={() => acceptSuggestion(suggestion, false)}
      checkboxAriaLabel={`Accept ${suggestion.suggestedName} tag`}
      trailing={
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          tabIndex={-1}
          aria-label={`Dismiss ${suggestion.suggestedName} suggestion`}
          onClick={(e) => {
            e.stopPropagation();
            dismissSuggestion(suggestion);
          }}
          className="ml-auto hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
        >
          <XIcon />
        </Button>
      }
    />
  );
}

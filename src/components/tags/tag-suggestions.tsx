import { CheckIcon, SparklesIcon, XIcon } from "lucide-react";
import { nanoid } from "nanoid";
import slugify from "slugify";

import { TagBadge } from "@/components/tags/tag-badge";
import { allTags$, pendingSuggestionsForLink$ } from "@/livestore/queries/tags";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";

interface TagSuggestionsProps {
  linkId: string;
}

export function TagSuggestions({ linkId }: TagSuggestionsProps) {
  const store = useAppStore();
  const suggestions = store.useQuery(pendingSuggestionsForLink$(linkId));
  const allTags = store.useQuery(allTags$);

  if (suggestions.length === 0) return null;

  const handleAccept = (suggestion: (typeof suggestions)[0]) => {
    if (!suggestion.tagId) {
      const id = slugify(suggestion.suggestedName, {
        lower: true,
        strict: true,
      });
      const maxSortOrder = Math.max(0, ...allTags.map((t) => t.sortOrder));

      store.commit(
        events.tagCreated({
          createdAt: new Date(),
          id,
          name: suggestion.suggestedName,
          sortOrder: maxSortOrder + 1,
        })
      );
      store.commit(
        events.linkTagged({
          createdAt: new Date(),
          id: nanoid(),
          linkId,
          tagId: id,
        })
      );
    } else {
      store.commit(
        events.linkTagged({
          createdAt: new Date(),
          id: nanoid(),
          linkId,
          tagId: suggestion.tagId,
        })
      );
    }
    store.commit(events.tagSuggestionAccepted({ id: suggestion.id }));
  };

  const handleDismiss = (suggestion: (typeof suggestions)[0]) => {
    store.commit(events.tagSuggestionDismissed({ id: suggestion.id }));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        <SparklesIcon className="h-3 w-3" />
        Suggested
      </div>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((suggestion) => (
          <div key={suggestion.id} className="inline-flex items-center gap-0.5">
            <TagBadge name={suggestion.suggestedName} />
            <button
              type="button"
              onClick={() => handleAccept(suggestion)}
              className="rounded p-0.5 text-green-600 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/30"
              aria-label={`Accept ${suggestion.suggestedName} tag`}
            >
              <CheckIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleDismiss(suggestion)}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted"
              aria-label={`Dismiss ${suggestion.suggestedName} tag`}
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

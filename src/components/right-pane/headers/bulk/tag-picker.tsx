import { PlusIcon, TagIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import { deriveNewTag, MAX_TAG_NAME_LENGTH } from "@/lib/tags";
import { allTags$, tagsByLink$ } from "@/livestore/queries/tags";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";

export function BulkTagPicker({
  selectedIds,
}: {
  selectedIds: ReadonlySet<string>;
}) {
  const store = useAppStore();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const allTags = store.useQuery(allTags$);
  const tagsByLinkRows = store.useQuery(tagsByLink$);

  useHotkeyScope("popover", {
    enabled: open,
    disableScopes: ["dialog", "selection"],
  });

  const existingTagIds = useMemo(
    () => new Set(allTags.map((t) => t.id)),
    [allTags]
  );
  const newTag = deriveNewTag(inputValue, existingTagIds);
  const canCreateTag = newTag !== null;

  const applyTag = (tagId: string) => {
    const createdAt = new Date();
    const existing = new Set(tagsByLinkRows.map((r) => `${r.linkId}:${r.id}`));
    const eventsToCommit = [...selectedIds]
      .filter((linkId) => !existing.has(`${linkId}:${tagId}`))
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
    if (!newTag) return;
    const createdAt = new Date();
    const maxSortOrder = Math.max(0, ...allTags.map((t) => t.sortOrder));
    store.commit(
      events.tagCreated({
        createdAt,
        id: newTag.id,
        name: newTag.name,
        sortOrder: maxSortOrder + 1,
      }),
      ...[...selectedIds].map((linkId) =>
        events.linkTagged({
          createdAt,
          id: `${linkId}-${newTag.id}`,
          linkId,
          tagId: newTag.id,
        })
      )
    );
    setOpen(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setInputValue("");
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
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
        <Command>
          <CommandInput
            value={inputValue}
            onValueChange={setInputValue}
            placeholder="Search or create tag..."
            maxLength={MAX_TAG_NAME_LENGTH}
            autoFocus
          />
          <CommandList>
            {!canCreateTag && (
              <CommandEmpty>
                {allTags.length === 0 ? "No tags yet" : "No tags found"}
              </CommandEmpty>
            )}
            {allTags.map((tag) => (
              <CommandItem
                key={tag.id}
                value={tag.name}
                onSelect={() => applyTag(tag.id)}
              >
                <span className="font-medium">#{tag.name}</span>
              </CommandItem>
            ))}
            {newTag && (
              <CommandItem
                value={`__create__${newTag.name}`}
                onSelect={createTagAndApply}
                forceMount
                className="text-primary"
              >
                <PlusIcon className="h-4 w-4" />
                Create &quot;#{newTag.name}&quot;
              </CommandItem>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

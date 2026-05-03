import { PlusIcon, TagIcon } from "lucide-react";
import { useState } from "react";
import slugify from "slugify";

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

  const trimmed = inputValue.trim();
  const slug = trimmed ? slugify(trimmed, { lower: true, strict: true }) : "";
  const canCreateTag = slug.length > 0 && !allTags.some((t) => t.id === slug);

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
    if (!canCreateTag) return;
    const createdAt = new Date();
    const maxSortOrder = Math.max(0, ...allTags.map((t) => t.sortOrder));
    store.commit(
      events.tagCreated({
        createdAt,
        id: slug,
        name: trimmed,
        sortOrder: maxSortOrder + 1,
      }),
      ...[...selectedIds].map((linkId) =>
        events.linkTagged({
          createdAt,
          id: `${linkId}-${slug}`,
          linkId,
          tagId: slug,
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
            {canCreateTag && (
              <CommandItem
                value={`__create__${trimmed}`}
                onSelect={createTagAndApply}
                forceMount
                className="text-primary"
              >
                <PlusIcon className="h-4 w-4" />
                Create &quot;#{trimmed}&quot;
              </CommandItem>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

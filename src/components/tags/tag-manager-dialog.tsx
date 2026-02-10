import { PlusIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import slugify from "slugify";

import { TagRow } from "@/components/tags/tag-row";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { track } from "@/lib/analytics";
import {
  allTagsWithCounts$,
  type TagWithCount,
} from "@/livestore/queries/tags";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";

interface TagManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TagManagerDialog({
  open,
  onOpenChange,
}: TagManagerDialogProps) {
  const store = useAppStore();
  const allTagsWithCounts = store.useQuery(allTagsWithCounts$);
  const [inputValue, setInputValue] = useState("");

  const filteredTags = useMemo((): TagWithCount[] => {
    if (!inputValue) return allTagsWithCounts as TagWithCount[];
    const query = inputValue.toLowerCase();
    return (allTagsWithCounts as TagWithCount[]).filter((tag) =>
      tag.name.toLowerCase().includes(query)
    );
  }, [allTagsWithCounts, inputValue]);

  const canCreateTag = useMemo(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return false;
    const slug = slugify(trimmed, { lower: true, strict: true });
    return (
      slug.length > 0 &&
      !allTagsWithCounts.some((t: TagWithCount) => t.id === slug)
    );
  }, [inputValue, allTagsWithCounts]);

  const handleCreateTag = () => {
    const name = inputValue.trim();
    if (!name) return;

    const id = slugify(name, { lower: true, strict: true });
    if (allTagsWithCounts.some((t: TagWithCount) => t.id === id)) return;

    const maxSortOrder = Math.max(
      0,
      ...allTagsWithCounts.map((t: TagWithCount) => t.sortOrder)
    );

    store.commit(
      events.tagCreated({
        id,
        name,
        sortOrder: maxSortOrder + 1,
        createdAt: new Date(),
      })
    );

    track("tag_created");
    setInputValue("");
  };

  const handleDeleteTag = (tagId: string) => {
    store.commit(
      events.tagDeleted({
        id: tagId,
        deletedAt: new Date(),
      })
    );
    track("tag_deleted");
  };

  const handleRenameTag = (tagId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    store.commit(
      events.tagRenamed({
        id: tagId,
        name: trimmed,
      })
    );
    track("tag_renamed");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Tags</DialogTitle>
        </DialogHeader>

        <InputGroup>
          <InputGroupAddon align="inline-start">
            <InputGroupText>
              <SearchIcon className="size-3.5" />
            </InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search or create tags..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canCreateTag) {
                handleCreateTag();
              }
            }}
          />
        </InputGroup>

        <div className="max-h-[300px] overflow-y-auto -mx-4 px-4">
          {canCreateTag && (
            <button
              type="button"
              onClick={handleCreateTag}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-primary hover:bg-muted/50"
            >
              <PlusIcon className="size-4" />
              Create &quot;#{inputValue.trim()}&quot;
            </button>
          )}

          {filteredTags.length === 0 && !canCreateTag ? (
            <p className="text-muted-foreground py-8 text-center text-xs">
              {inputValue ? "No tags match your search" : "No tags yet"}
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {filteredTags.map((tag) => (
                <TagRow
                  key={tag.id}
                  tag={tag}
                  count={tag.count}
                  onRename={(newName) => handleRenameTag(tag.id, newName)}
                  onDelete={() => handleDeleteTag(tag.id)}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

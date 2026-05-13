import { PlusIcon, SearchIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";

import { TagRow } from "@/components/tags/tag-row";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { track } from "@/lib/analytics";
import { deriveNewTag, MAX_TAG_NAME_LENGTH, sanitizeTagName } from "@/lib/tags";
import { allTagsWithCounts$ } from "@/livestore/queries/tags";
import type { TagWithCount } from "@/livestore/queries/tags";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";

export function TagsSection() {
  const store = useAppStore();
  const allTagsWithCounts = store.useQuery(allTagsWithCounts$);
  const [inputValue, setInputValue] = useState("");

  const searchQuery = useMemo(() => sanitizeTagName(inputValue), [inputValue]);

  const filteredTags = useMemo((): readonly TagWithCount[] => {
    if (!searchQuery) return allTagsWithCounts;
    return allTagsWithCounts.filter((tag: TagWithCount) =>
      tag.id.includes(searchQuery)
    );
  }, [allTagsWithCounts, searchQuery]);

  const existingTagIds = useMemo(
    () => new Set(allTagsWithCounts.map((t: TagWithCount) => t.id)),
    [allTagsWithCounts]
  );

  const newTag = useMemo(
    () => deriveNewTag(inputValue, existingTagIds),
    [inputValue, existingTagIds]
  );

  const canCreateTag = newTag !== null;

  const handleCreateTag = () => {
    if (!newTag) return;

    const maxSortOrder = Math.max(
      0,
      ...allTagsWithCounts.map((t: TagWithCount) => t.sortOrder)
    );

    store.commit(
      events.tagCreated({
        id: newTag.id,
        name: newTag.name,
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
    <div className="flex flex-1 flex-col min-h-0 gap-3">
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <InputGroupText>
            <SearchIcon className="size-3.5" />
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search or add a tag"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          maxLength={MAX_TAG_NAME_LENGTH}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canCreateTag) {
              handleCreateTag();
            }
          }}
        />
      </InputGroup>

      <div className="flex min-h-0 flex-1 flex-col gap-1">
        {newTag && (
          <button
            type="button"
            onClick={handleCreateTag}
            className="-mx-1 flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/50"
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
          {allTagsWithCounts.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-xs">
              No tags yet
            </p>
          ) : (
            <>
              {filteredTags.length === 0 && (
                <p className="text-muted-foreground py-8 text-center text-xs">
                  No tags match your search
                </p>
              )}
              <div className="flex flex-col gap-1">
                <AnimatePresence initial={false}>
                  {allTagsWithCounts.map((tag: TagWithCount) => {
                    const matches =
                      !searchQuery || tag.id.includes(searchQuery);
                    return (
                      <motion.div
                        key={tag.id}
                        initial={{ opacity: 0, scale: 0.95, height: 0 }}
                        animate={{ opacity: 1, scale: 1, height: "auto" }}
                        exit={{ opacity: 0, scale: 0.95, height: 0 }}
                        transition={{
                          type: "spring",
                          duration: 0.3,
                          bounce: 0,
                        }}
                        style={{
                          overflow: "hidden",
                          transformOrigin: "left center",
                        }}
                        hidden={!matches}
                      >
                        <TagRow
                          tag={tag}
                          count={tag.count}
                          onRename={(newName) =>
                            handleRenameTag(tag.id, newName)
                          }
                          onDelete={() => handleDeleteTag(tag.id)}
                        />
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

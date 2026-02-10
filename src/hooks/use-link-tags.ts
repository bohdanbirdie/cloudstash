import { useCallback, useMemo } from "react";

import { track } from "@/lib/analytics";
import { tagsForLink$ } from "@/livestore/queries/tags";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";

export function useLinkTags(linkId: string) {
  const store = useAppStore();
  const tags = store.useQuery(tagsForLink$(linkId));

  const tagIds = useMemo(() => tags.map((t) => t.id), [tags]);

  const setTagIds = useCallback(
    (newTagIds: string[]) => {
      const currentIds = new Set(tagIds);
      const newIds = new Set(newTagIds);

      let added = 0;
      let removed = 0;

      for (const id of currentIds) {
        if (!newIds.has(id)) {
          const linkTagId = `${linkId}-${id}`;
          store.commit(events.linkUntagged({ id: linkTagId }));
          removed++;
        }
      }

      for (const id of newIds) {
        if (!currentIds.has(id)) {
          const linkTagId = `${linkId}-${id}`;
          store.commit(
            events.linkTagged({
              createdAt: new Date(),
              id: linkTagId,
              linkId,
              tagId: id,
            })
          );
          added++;
        }
      }

      if (added > 0) track("link_tagged", { count: added });
      if (removed > 0) track("link_untagged", { count: removed });
    },
    [store, linkId, tagIds]
  );

  return { tags, tagIds, setTagIds };
}

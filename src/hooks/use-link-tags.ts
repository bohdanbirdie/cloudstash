import { track } from "@/lib/analytics";
import { tagsForLink$ } from "@/livestore/queries/tags";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";

export function useLinkTags(linkId: string) {
  const store = useAppStore();
  const tags = store.useQuery(tagsForLink$(linkId));
  const tagIds = tags.map((t) => t.id);

  const setTagIds = (newTagIds: string[]) => {
    const currentIds = new Set(tagIds);
    const newIds = new Set(newTagIds);
    const createdAt = new Date();

    const removeEvents = [...currentIds]
      .filter((id) => !newIds.has(id))
      .map((id) => events.linkUntaggedV2({ linkId, tagId: id }));

    const addEvents = [...newIds]
      .filter((id) => !currentIds.has(id))
      .map((id) =>
        events.linkTagged({
          createdAt,
          id: `${linkId}-${id}`,
          linkId,
          tagId: id,
        })
      );

    if (removeEvents.length === 0 && addEvents.length === 0) return;

    store.commit(...removeEvents, ...addEvents);
    if (addEvents.length > 0) track("link_tagged", { count: addEvents.length });
    if (removeEvents.length > 0)
      track("link_untagged", { count: removeEvents.length });
  };

  return { tagIds, setTagIds };
}

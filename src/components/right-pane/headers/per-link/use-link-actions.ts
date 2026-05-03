import { actionRemovesFromPage } from "@/components/right-pane/headers/page-actions";
import type { LinkAction } from "@/components/right-pane/headers/page-actions";
import { useFilteredLinks } from "@/hooks/use-filtered-links";
import { usePageStaticData } from "@/hooks/use-page-static-data";
import { useTrackLinkOpen } from "@/hooks/use-track-link-open";
import type { LinkWithDetails } from "@/livestore/queries/schemas";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";
import { useRightPaneStore } from "@/stores/right-pane-store";

export function useLinkActions(link: LinkWithDetails) {
  const store = useAppStore();
  const trackLinkOpen = useTrackLinkOpen();
  const closeDetail = useRightPaneStore((s) => s.closeDetail);
  const navigate = useRightPaneStore((s) => s.navigate);
  const { status } = usePageStaticData();
  const links = useFilteredLinks(status);

  const currentIndex = links.findIndex((l) => l.id === link.id);
  const inList = currentIndex >= 0;

  const getNextLinkId = (): string | null => {
    if (!inList) return null;
    const nextLink = links[currentIndex + 1] ?? links[currentIndex - 1];
    return nextLink?.id ?? null;
  };

  const act = (action: LinkAction, commit: () => void) => {
    const willRemove = actionRemovesFromPage(action, status);
    const nextLinkId = willRemove ? getNextLinkId() : null;

    commit();

    if (nextLinkId) {
      trackLinkOpen(nextLinkId);
      navigate(nextLinkId);
    } else if (willRemove) {
      closeDetail();
    }
  };

  return {
    listLength: links.length,
    currentIndex,
    inList,
    handleComplete: () =>
      act("complete", () => {
        store.commit(
          events.linkCompleted({ completedAt: new Date(), id: link.id })
        );
      }),
    handleUncomplete: () =>
      act("uncomplete", () => {
        store.commit(events.linkUncompleted({ id: link.id }));
      }),
    handleDelete: () =>
      act("archive", () => {
        store.commit(
          events.linkDeleted({ deletedAt: new Date(), id: link.id })
        );
      }),
    handleRestore: () =>
      act("restore", () => {
        store.commit(events.linkRestored({ id: link.id }));
      }),
  };
}

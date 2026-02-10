import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import { LinksPageLayout } from "@/components/links-page-layout";
import { track } from "@/lib/analytics";
import { allLinksProjection } from "@/lib/link-projections";
import { allLinks$, type LinkWithDetails } from "@/livestore/queries/links";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";

export const Route = createFileRoute("/_authed/all")({
  component: AllLinksPage,
  staticData: { icon: "list", title: "All Links" },
});

function AllLinksPage() {
  const store = useAppStore();
  const links = store.useQuery(allLinks$);

  const handleBulkComplete = useCallback(
    (selected: LinkWithDetails[]) => {
      for (const link of selected) {
        if (link.completedAt) {
          store.commit(events.linkUncompleted({ id: link.id }));
        } else {
          store.commit(
            events.linkCompleted({ completedAt: new Date(), id: link.id })
          );
        }
      }
      track("bulk_action_used", {
        action: "toggle_complete",
        count: selected.length,
      });
    },
    [store]
  );

  const handleBulkDelete = useCallback(
    (selected: LinkWithDetails[]) => {
      for (const link of selected) {
        store.commit(
          events.linkDeleted({ deletedAt: new Date(), id: link.id })
        );
      }
      track("bulk_action_used", { action: "delete", count: selected.length });
    },
    [store]
  );

  return (
    <LinksPageLayout
      title="All Links"
      subtitle="Everything you've saved."
      links={links}
      emptyMessage="No links saved yet"
      toolbarConfig={{
        onComplete: handleBulkComplete,
        onDelete: handleBulkDelete,
      }}
      projection={allLinksProjection}
    />
  );
}

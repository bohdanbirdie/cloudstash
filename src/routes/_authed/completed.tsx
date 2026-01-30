import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import { LinksPageLayout } from "@/components/links-page-layout";
import { completedLinks$, type LinkWithDetails } from "@/livestore/queries";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";

export const Route = createFileRoute("/_authed/completed")({
  component: CompletedPage,
  staticData: { icon: "check-circle", title: "Completed" },
});

function CompletedPage() {
  const store = useAppStore();
  const links = store.useQuery(completedLinks$);

  const handleBulkUncomplete = useCallback(
    (selected: LinkWithDetails[]) => {
      for (const link of selected) {
        store.commit(events.linkUncompleted({ id: link.id }));
      }
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
    },
    [store]
  );

  return (
    <LinksPageLayout
      title="Completed"
      subtitle="Links you've finished reading."
      links={links}
      emptyMessage="No completed links yet"
      toolbarConfig={{
        onComplete: handleBulkUncomplete,
        onDelete: handleBulkDelete,
        isCompleted: true,
      }}
    />
  );
}

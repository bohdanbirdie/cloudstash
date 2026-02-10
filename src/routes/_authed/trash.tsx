import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import { LinksPageLayout } from "@/components/links-page-layout";
import { track } from "@/lib/analytics";
import { trashProjection } from "@/lib/link-projections";
import { trashLinks$, type LinkWithDetails } from "@/livestore/queries/links";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";

export const Route = createFileRoute("/_authed/trash")({
  component: TrashPage,
  staticData: { icon: "trash", title: "Trash" },
});

function TrashPage() {
  const store = useAppStore();
  const links = store.useQuery(trashLinks$);

  const handleBulkRestore = useCallback(
    (selected: LinkWithDetails[]) => {
      for (const link of selected) {
        store.commit(events.linkRestored({ id: link.id }));
      }
      track("bulk_action_used", { action: "restore", count: selected.length });
    },
    [store]
  );

  return (
    <LinksPageLayout
      title="Trash"
      subtitle="Deleted links. Empty after 30 days."
      links={links}
      emptyMessage="Trash is empty"
      toolbarConfig={{
        onDelete: handleBulkRestore,
        isTrash: true,
        showComplete: false,
      }}
      projection={trashProjection}
    />
  );
}

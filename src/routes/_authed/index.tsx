import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import { LinksPageLayout } from "@/components/links-page-layout";
import { inboxProjection } from "@/lib/link-projections";
import { inboxLinks$, type LinkWithDetails } from "@/livestore/queries";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";

export const Route = createFileRoute("/_authed/")({
  component: HomePage,
  staticData: { icon: "inbox", title: "Inbox" },
});

function HomePage() {
  const store = useAppStore();
  const links = store.useQuery(inboxLinks$);

  const handleBulkComplete = useCallback(
    (selected: LinkWithDetails[]) => {
      for (const link of selected) {
        store.commit(
          events.linkCompleted({ completedAt: new Date(), id: link.id })
        );
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
      title="Inbox"
      subtitle="Links to read later."
      links={links}
      emptyMessage="No links in your inbox"
      toolbarConfig={{
        onComplete: handleBulkComplete,
        onDelete: handleBulkDelete,
      }}
      projection={inboxProjection}
    />
  );
}

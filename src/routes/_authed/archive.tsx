import { createFileRoute } from "@tanstack/react-router";

import { LinksPageLayout } from "@/components/links-page-layout";
import { archiveProjection } from "@/lib/link-projections";
import { archiveLinks$ } from "@/livestore/queries/links";
import { useAppStore } from "@/livestore/store";

export const Route = createFileRoute("/_authed/archive")({
  component: ArchivePage,
  staticData: { icon: "archive", title: "Archive" },
});

function ArchivePage() {
  const store = useAppStore();
  const links = store.useQuery(archiveLinks$);

  return (
    <LinksPageLayout
      title="Archive"
      links={links}
      emptyMessage="Archive is empty"
      projection={archiveProjection}
    />
  );
}

import { createFileRoute } from "@tanstack/react-router";

import { LinksPageLayout } from "@/components/links-page-layout";
import { trashProjection } from "@/lib/link-projections";
import { trashLinks$ } from "@/livestore/queries/links";
import { useAppStore } from "@/livestore/store";

export const Route = createFileRoute("/_authed/trash")({
  component: TrashPage,
  staticData: { icon: "trash", title: "Trash" },
});

function TrashPage() {
  const store = useAppStore();
  const links = store.useQuery(trashLinks$);

  return (
    <LinksPageLayout
      title="Trash"
      links={links}
      emptyMessage="Trash is empty"
      projection={trashProjection}
    />
  );
}

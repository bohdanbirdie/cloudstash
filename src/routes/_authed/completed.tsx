import { createFileRoute } from "@tanstack/react-router";

import { LinksPageLayout } from "@/components/links-page-layout";
import { completedProjection } from "@/lib/link-projections";
import { completedLinks$ } from "@/livestore/queries/links";
import { useAppStore } from "@/livestore/store";

export const Route = createFileRoute("/_authed/completed")({
  component: CompletedPage,
  staticData: { icon: "check-circle", title: "Completed" },
});

function CompletedPage() {
  const store = useAppStore();
  const links = store.useQuery(completedLinks$);

  return (
    <LinksPageLayout
      title="Completed"
      links={links}
      emptyMessage="No completed links yet"
      projection={completedProjection}
    />
  );
}

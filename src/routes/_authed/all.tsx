import { createFileRoute } from "@tanstack/react-router";

import { LinksPageLayout } from "@/components/links-page-layout";
import { allLinksProjection } from "@/lib/link-projections";
import { allLinks$ } from "@/livestore/queries/links";
import { useAppStore } from "@/livestore/store";

export const Route = createFileRoute("/_authed/all")({
  component: AllLinksPage,
  staticData: { icon: "list", title: "All Links" },
});

function AllLinksPage() {
  const store = useAppStore();
  const links = store.useQuery(allLinks$);

  return (
    <LinksPageLayout
      title="All Links"
      links={links}
      emptyMessage="No links saved yet"
      projection={allLinksProjection}
    />
  );
}

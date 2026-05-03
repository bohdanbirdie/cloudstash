import { memo } from "react";

import { usePageStaticData } from "@/hooks/use-page-static-data";
import type { LinkStatus } from "@/livestore/queries/filtered-links";
import {
  allLinksCount$,
  archiveCount$,
  completedCount$,
  inboxCount$,
} from "@/livestore/queries/links";
import { useAppStore } from "@/livestore/store";

const COUNT_BY_STATUS = {
  inbox: inboxCount$,
  all: allLinksCount$,
  completed: completedCount$,
  archive: archiveCount$,
} as const satisfies Record<LinkStatus, unknown>;

export const Masthead = memo(function Masthead() {
  const { title, noun, status } = usePageStaticData();

  if (!title || !noun || !status) return null;

  return (
    <section className="min-w-0">
      <h1 className="text-[52px] font-extrabold leading-none tracking-tight text-foreground tabular-nums">
        {title.toUpperCase()}
      </h1>
      <MastheadMeta status={status} noun={noun} />
    </section>
  );
});

const MastheadMeta = memo(function MastheadMeta({
  status,
  noun,
}: {
  status: LinkStatus;
  noun: string;
}) {
  const store = useAppStore();
  const count = store.useQuery(COUNT_BY_STATUS[status]);

  return (
    <div className="mt-2 text-[13px] font-normal text-muted-foreground tabular-nums">
      {count} {noun}
    </div>
  );
});

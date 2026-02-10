import {
  filteredLinks$,
  type LinkStatus,
  type TagFilterOptions,
} from "@/livestore/queries/filtered-links";
import {
  allLinks$,
  completedLinks$,
  inboxLinks$,
  trashLinks$,
} from "@/livestore/queries/links";

export type LinkAction = "complete" | "uncomplete" | "delete" | "restore";

export interface LinkProjection {
  /** Base query without filters */
  query: typeof inboxLinks$;
  /** Status used for filtered queries */
  status: LinkStatus;
  /** Get query with tag filters applied */
  filteredQuery: (
    options: TagFilterOptions
  ) => ReturnType<typeof filteredLinks$>;
  willActionRemoveLink: (action: LinkAction) => boolean;
}

function createProjection(
  query: typeof inboxLinks$,
  status: LinkStatus,
  willActionRemoveLink: (action: LinkAction) => boolean
): LinkProjection {
  return {
    query,
    status,
    filteredQuery: (options) => filteredLinks$(status, options),
    willActionRemoveLink,
  };
}

export const inboxProjection = createProjection(
  inboxLinks$,
  "inbox",
  () => true
);

export const allLinksProjection = createProjection(
  allLinks$,
  "all",
  (action) => action === "delete"
);

export const completedProjection = createProjection(
  completedLinks$,
  "completed",
  (action) => action === "uncomplete" || action === "delete"
);

export const trashProjection = createProjection(
  trashLinks$,
  "trash",
  () => true
);

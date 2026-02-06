import {
  allLinks$,
  completedLinks$,
  inboxLinks$,
  trashLinks$,
} from "@/livestore/queries";

export type LinkAction = "complete" | "uncomplete" | "delete" | "restore";

export interface LinkProjection {
  query: typeof inboxLinks$;
  willActionRemoveLink: (action: LinkAction) => boolean;
}

export const inboxProjection: LinkProjection = {
  query: inboxLinks$,
  willActionRemoveLink: () => true,
};

export const allLinksProjection: LinkProjection = {
  query: allLinks$,
  willActionRemoveLink: (action) => action === "delete",
};

export const completedProjection: LinkProjection = {
  query: completedLinks$,
  willActionRemoveLink: (action) =>
    action === "uncomplete" || action === "delete",
};

export const trashProjection: LinkProjection = {
  query: trashLinks$,
  willActionRemoveLink: () => true,
};

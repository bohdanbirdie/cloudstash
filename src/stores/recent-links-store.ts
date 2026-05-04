import { create } from "zustand";
import type { StateCreator } from "zustand";
import { persist } from "zustand/middleware";

const MAX_LINKS = 10;

export interface RecentLink {
  id: string;
  ts: number;
}

export interface RecentLinksState {
  links: RecentLink[];
  addLink: (id: string) => void;
  removeLink: (id: string) => void;
  clear: () => void;
}

export const recentLinksCreator: StateCreator<RecentLinksState> = (set) => ({
  links: [],
  addLink: (id) => {
    if (!id) return;
    set((s) => {
      const filtered = s.links.filter((x) => x.id !== id);
      const next: RecentLink[] = [{ id, ts: Date.now() }, ...filtered];
      return { links: next.slice(0, MAX_LINKS) };
    });
  },
  removeLink: (id) =>
    set((s) => ({ links: s.links.filter((x) => x.id !== id) })),
  clear: () => set({ links: [] }),
});

export const useRecentLinksStore = create<RecentLinksState>()(
  persist(recentLinksCreator, {
    name: "cloudstash:recent-links",
    version: 1,
  })
);

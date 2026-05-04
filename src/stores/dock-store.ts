import { create } from "zustand";

export type DockMode = "closed" | "search" | "agent";

interface DockStore {
  mode: DockMode;
  query: string;
  agentEverOpened: boolean;
  setMode: (mode: DockMode) => void;
  setQuery: (query: string) => void;
  close: () => void;
}

export const useDockStore = create<DockStore>((set) => ({
  mode: "closed",
  query: "",
  agentEverOpened: false,
  setMode: (mode) =>
    set((s) => {
      if (s.mode === mode) return s;
      return {
        mode,
        query: mode === "search" ? s.query : "",
        agentEverOpened: s.agentEverOpened || mode === "agent",
      };
    }),
  setQuery: (query) => set({ query }),
  close: () =>
    set((s) => (s.mode === "closed" ? s : { mode: "closed", query: "" })),
}));

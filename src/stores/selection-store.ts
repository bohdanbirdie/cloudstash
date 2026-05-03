import { create } from "zustand";

import { transition } from "@/lib/selection-model";
import type { Action, Modifier } from "@/lib/selection-model";

interface SelectionStore {
  ids: ReadonlySet<string>;
  anchor: string | null;
  hoveredId: string | null;
  modifier: Modifier;

  click: (
    id: string,
    modifier: Modifier,
    allIds: readonly string[],
    activeId: string | null
  ) => void;
  toggleCheckbox: (id: string) => void;
  clear: () => void;
  prune: (validIds: ReadonlySet<string>) => void;

  setHovered: (id: string | null) => void;
  setModifier: (m: Modifier) => void;
}

export const useSelectionStore = create<SelectionStore>((set) => {
  const dispatch = (
    action: Action,
    allIds: readonly string[],
    activeId: string | null
  ) =>
    set((s) => {
      const next = transition(
        { activeId, allIds, anchor: s.anchor, ids: s.ids },
        action
      );
      if (next.ids === s.ids && next.anchor === s.anchor) return s;
      return { anchor: next.anchor, ids: next.ids };
    });

  return {
    anchor: null,
    hoveredId: null,
    ids: new Set(),
    modifier: "none",

    clear: () => dispatch({ type: "clear" }, [], null),
    click: (id, modifier, allIds, activeId) =>
      dispatch({ id, modifier, type: "click" }, allIds, activeId),
    prune: (validIds) => dispatch({ type: "prune", validIds }, [], null),
    toggleCheckbox: (id) => dispatch({ id, type: "checkbox" }, [], null),

    setHovered: (id) =>
      set((s) => (s.hoveredId === id ? s : { hoveredId: id })),
    setModifier: (m) => set((s) => (s.modifier === m ? s : { modifier: m })),
  };
});

export function useInSelectionMode(): boolean {
  return useSelectionStore((s) => s.ids.size > 0);
}

import { create } from "zustand";

import { toggleSelection, selectRange, removeStaleIds } from "@/lib/selection";

interface SelectionState {
  selectedIds: Set<string>;
  anchorIndex: number | null;
  toggle: (id: string, index: number) => void;
  range: (targetIndex: number, allIds: readonly string[]) => void;
  clear: () => void;
  removeStale: (validIds: Set<string>) => void;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  anchorIndex: null,
  clear: () => set({ anchorIndex: null, selectedIds: new Set() }),

  range: (targetIndex, allIds) => {
    const { anchorIndex, selectedIds } = get();
    if (anchorIndex === null) {
      return;
    }
    set({
      selectedIds: selectRange(selectedIds, anchorIndex, targetIndex, allIds),
    });
  },

  removeStale: (validIds) =>
    set((state) => {
      const next = removeStaleIds(state.selectedIds, validIds);
      return next.size === state.selectedIds.size
        ? state
        : { selectedIds: next };
    }),

  selectedIds: new Set(),

  toggle: (id, index) =>
    set({
      anchorIndex: index,
      selectedIds: toggleSelection(get().selectedIds, id),
    }),
}));

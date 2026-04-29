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
      if (next.size === state.selectedIds.size) return state;
      // Reset the anchor when the selection is wiped — otherwise a stale index
      // pivots the next shift-click against a row that's no longer there.
      if (next.size === 0) return { anchorIndex: null, selectedIds: next };
      return { selectedIds: next };
    }),

  selectedIds: new Set(),

  toggle: (id, index) =>
    set({
      anchorIndex: index,
      selectedIds: toggleSelection(get().selectedIds, id),
    }),
}));

export function useIsSelected(id: string): boolean {
  return useSelectionStore((state) => state.selectedIds.has(id));
}

export function useSelectionCount(): number {
  return useSelectionStore((state) => state.selectedIds.size);
}

// Boolean variant of useSelectionCount — only flips at the 0 ↔ ≥1 threshold,
// so subscribers don't re-render on every selection toggle when they only
// care about whether selection mode is active.
export function useInSelectionMode(): boolean {
  return useSelectionStore((state) => state.selectedIds.size > 0);
}

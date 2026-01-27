import { create } from "zustand";

interface LinkDetailState {
  linkId: string | null;
  open: boolean;
  linkIds: readonly string[] | null;
  currentIndex: number | null;
  openLink: (linkId: string) => void;
  openLinkInContext: (linkIds: readonly string[], index: number) => void;
  close: () => void;
  goToPrevious: () => void;
  goToNext: () => void;
  moveAfterAction: () => void;
}

export const useLinkDetailStore = create<LinkDetailState>((set, get) => ({
  close: () => set({ open: false }),
  currentIndex: null,
  goToNext: () => {
    const { linkIds, currentIndex } = get();
    if (linkIds && currentIndex !== null && currentIndex < linkIds.length - 1) {
      const newIndex = currentIndex + 1;
      set({ currentIndex: newIndex, linkId: linkIds[newIndex] });
    }
  },
  goToPrevious: () => {
    const { linkIds, currentIndex } = get();
    if (linkIds && currentIndex !== null && currentIndex > 0) {
      const newIndex = currentIndex - 1;
      set({ currentIndex: newIndex, linkId: linkIds[newIndex] });
    }
  },

  linkId: null,

  linkIds: null,

  moveAfterAction: () => {
    const { linkIds, currentIndex } = get();
    if (!linkIds || currentIndex === null) {
      set({ open: false });
      return;
    }
    // If there's a next link, stay at same index (list will shift)
    // If no next but has previous, go to previous
    // Otherwise close
    if (currentIndex < linkIds.length - 1) {
      // Stay at current index, the list will update
      return;
    }
    if (currentIndex > 0) {
      set({
        currentIndex: currentIndex - 1,
        linkId: linkIds[currentIndex - 1],
      });
    } else {
      set({ open: false });
    }
  },

  open: false,

  openLink: (linkId) =>
    set({ currentIndex: null, linkId, linkIds: null, open: true }),

  openLinkInContext: (linkIds, index) => {
    const linkId = linkIds[index];
    if (linkId) {
      set({ linkId, open: true, linkIds, currentIndex: index });
    }
  },
}));

export const selectHasPrevious = (state: LinkDetailState) =>
  state.currentIndex !== null && state.currentIndex > 0;

export const selectHasNext = (state: LinkDetailState) =>
  state.linkIds !== null &&
  state.currentIndex !== null &&
  state.currentIndex < state.linkIds.length - 1;

export const selectHasNavigation = (state: LinkDetailState) =>
  state.linkIds !== null;

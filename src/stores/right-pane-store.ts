import { create } from "zustand";

interface RightPaneState {
  activeLinkId: string | null;
  openDetail: (linkId: string) => void;
  closeDetail: () => void;
  toggleDetail: (linkId: string) => void;
  navigate: (linkId: string) => void;
}

export const useRightPaneStore = create<RightPaneState>((set) => ({
  activeLinkId: null,
  closeDetail: () => set({ activeLinkId: null }),
  navigate: (linkId) =>
    set((state) => (state.activeLinkId ? { activeLinkId: linkId } : state)),
  openDetail: (linkId) => set({ activeLinkId: linkId }),
  toggleDetail: (linkId) =>
    set((state) => ({
      activeLinkId: state.activeLinkId === linkId ? null : linkId,
    })),
}));

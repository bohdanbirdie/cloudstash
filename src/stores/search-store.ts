import { create } from 'zustand'

interface SearchState {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

export const useSearchStore = create<SearchState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
}))

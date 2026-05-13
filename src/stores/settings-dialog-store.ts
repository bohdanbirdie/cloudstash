import { create } from "zustand";

import type { SettingsSection } from "@/components/settings/settings-dialog";

interface SettingsDialogStore {
  open: boolean;
  section: SettingsSection;
  openAt: (section?: SettingsSection) => void;
  close: () => void;
  setOpen: (open: boolean) => void;
}

export const useSettingsDialog = create<SettingsDialogStore>((set) => ({
  open: false,
  section: "account",
  openAt: (section = "account") => set({ open: true, section }),
  close: () => set({ open: false }),
  setOpen: (open) => set({ open }),
}));

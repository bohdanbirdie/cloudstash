import { create } from "zustand";

import type { PlanTier } from "@/lib/plan";

interface OpenPaywallOptions {
  highlightTier?: PlanTier;
  reason?: string;
}

interface PaywallStore {
  open: boolean;
  highlightTier: PlanTier | null;
  reason: string | null;
  openPaywall: (options?: OpenPaywallOptions) => void;
  close: () => void;
  setOpen: (open: boolean) => void;
}

export const usePaywall = create<PaywallStore>((set) => ({
  open: false,
  highlightTier: null,
  reason: null,
  openPaywall: (options) =>
    set({
      open: true,
      highlightTier: options?.highlightTier ?? null,
      reason: options?.reason ?? null,
    }),
  close: () => set({ open: false }),
  setOpen: (open) => set({ open }),
}));

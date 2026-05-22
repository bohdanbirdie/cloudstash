import { createContext, useContext } from "react";

const PopoverBoundaryContext = createContext<HTMLElement | null>(null);

export const PopoverBoundaryProvider = PopoverBoundaryContext.Provider;

export function usePopoverBoundary() {
  return useContext(PopoverBoundaryContext);
}

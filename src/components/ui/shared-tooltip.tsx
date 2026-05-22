import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { createContext, useContext, useMemo } from "react";
import type { ReactElement, ReactNode } from "react";

import { TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type SharedTooltipHandle = TooltipPrimitive.Handle<string>;

const SharedTooltipContext = createContext<SharedTooltipHandle | null>(null);

interface SharedTooltipProviderProps {
  children: ReactNode;
  hideArrow?: boolean;
  contentClassName?: string;
  positionerClassName?: string;
}

export function SharedTooltipProvider({
  children,
  hideArrow,
  contentClassName,
  positionerClassName,
}: SharedTooltipProviderProps) {
  const handle = useMemo(() => TooltipPrimitive.createHandle<string>(), []);
  return (
    <SharedTooltipContext.Provider value={handle}>
      <TooltipPrimitive.Provider closeDelay={150} delay={0}>
        {children}
        <TooltipPrimitive.Root handle={handle}>
          {({ payload }) => (
            <TooltipContent
              hideArrow={hideArrow}
              className={cn("data-[instant]:animate-none", contentClassName)}
              positionerClassName={positionerClassName}
            >
              {payload}
            </TooltipContent>
          )}
        </TooltipPrimitive.Root>
      </TooltipPrimitive.Provider>
    </SharedTooltipContext.Provider>
  );
}

export function SharedTooltipTrigger({
  payload,
  render,
}: {
  payload: string;
  render: ReactElement;
}) {
  const handle = useContext(SharedTooltipContext);
  if (!handle) {
    throw new Error(
      "SharedTooltipTrigger must be used inside SharedTooltipProvider"
    );
  }
  return (
    <TooltipPrimitive.Trigger
      handle={handle}
      payload={payload}
      render={render}
    />
  );
}

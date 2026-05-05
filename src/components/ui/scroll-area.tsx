import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function ScrollArea({
  className,
  children,
  ...props
}: ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  return (
    <ScrollAreaPrimitive.Root
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        tabIndex={-1}
        className="size-full pr-3 outline-none [--fade-y-end:0px] [--fade-y-start:0px] [mask-image:linear-gradient(to_bottom,transparent_0,black_var(--fade-y-start),black_calc(100%-var(--fade-y-end)),transparent_100%)] data-[overflow-y-end]:[--fade-y-end:1.5rem] data-[overflow-y-start]:[--fade-y-start:1.5rem]"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        orientation="vertical"
        className="group flex w-1.5 touch-none select-none bg-transparent p-px transition-colors data-[hovering]:bg-muted/40 data-[scrolling]:bg-muted/40"
      >
        <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-border opacity-0 transition-opacity group-data-[hovering]:opacity-100 group-data-[scrolling]:opacity-100" />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

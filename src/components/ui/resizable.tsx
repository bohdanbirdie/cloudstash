import {
  Group,
  Panel,
  Separator,
  type GroupProps,
  type PanelProps,
  type SeparatorProps,
  type PanelImperativeHandle,
} from "react-resizable-panels"

import { cn } from "@/lib/utils"

type ResizablePanelGroupProps = Omit<GroupProps, "orientation"> & {
  direction?: "horizontal" | "vertical";
  orientation?: "horizontal" | "vertical";
};

function ResizablePanelGroup({
  className,
  direction,
  orientation = "horizontal",
  ...props
}: ResizablePanelGroupProps) {
  const resolvedOrientation = direction ?? orientation;
  return (
    <Group
      data-slot="resizable-panel-group"
      data-panel-group-direction={resolvedOrientation}
      orientation={resolvedOrientation}
      className={cn(
        "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function ResizablePanel({ className, ...props }: PanelProps) {
  return <Panel data-slot="resizable-panel" className={className} {...props} />
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: Omit<SeparatorProps, "children"> & {
  withHandle?: boolean
}) {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        "bg-border focus-visible:ring-ring relative flex w-px items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:translate-x-0 data-[panel-group-direction=vertical]:after:-translate-y-1/2 [&[data-panel-group-direction=vertical]>div]:rotate-90",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-border h-6 w-1 rounded-none z-10 flex shrink-0" />
      )}
    </Separator>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
export type { PanelImperativeHandle, PanelProps }

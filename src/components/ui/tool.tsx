import { type DynamicToolUIPart, type ToolUIPart, type UITools } from "ai";
import { getToolName } from "ai";
import {
  CheckCircle,
  ChevronDown,
  Loader2,
  Settings,
  ShieldQuestion,
  XCircle,
  XOctagon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type ToolPartType = ToolUIPart<UITools> | DynamicToolUIPart;

export type ToolProps = {
  toolPart: ToolPartType;
  defaultOpen?: boolean;
  className?: string;
};

const Tool = ({ toolPart, defaultOpen = false, className }: ToolProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const { state } = toolPart;
  const output = "output" in toolPart ? toolPart.output : undefined;
  const errorText = "errorText" in toolPart ? toolPart.errorText : undefined;
  const toolName = getToolName(toolPart);

  const getStateIcon = () => {
    const iconClass = "size-3";
    switch (state) {
      case "input-streaming":
        return (
          <Loader2 className={cn(iconClass, "animate-spin text-blue-500")} />
        );
      case "input-available":
        return <Settings className={cn(iconClass, "text-orange-500")} />;
      case "approval-requested":
      case "approval-responded":
        return <ShieldQuestion className={cn(iconClass, "text-yellow-500")} />;
      case "output-available":
        return <CheckCircle className={cn(iconClass, "text-green-500")} />;
      case "output-error":
        return <XCircle className={cn(iconClass, "text-red-500")} />;
      case "output-denied":
        return <XOctagon className={cn(iconClass, "text-red-500")} />;
      default:
        return <Settings className={cn(iconClass, "text-muted-foreground")} />;
    }
  };

  const formatValue = (value: unknown): string => {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value === "string") return value;
    if (typeof value === "object") {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  const hasExpandableContent =
    output !== undefined ||
    state === "input-streaming" ||
    (state === "output-error" && errorText);

  return (
    <div
      className={cn(
        "border-border overflow-hidden rounded-md border",
        className
      )}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              className="bg-muted/50 h-auto w-full justify-between rounded-none px-2 py-1.5 font-normal text-xs"
            />
          }
        >
          <div className="flex items-center gap-1.5">
            {getStateIcon()}
            <span className="font-medium">{toolName}</span>
          </div>
          {hasExpandableContent && (
            <ChevronDown
              className={cn(
                "size-3 text-muted-foreground",
                isOpen && "rotate-180"
              )}
            />
          )}
        </CollapsibleTrigger>
        {hasExpandableContent && (
          <CollapsibleContent
            className={cn(
              "border-border border-t",
              "data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden"
            )}
          >
            <div className="bg-background p-2">
              {output !== undefined && (
                <div className="max-h-40 overflow-auto font-mono text-xs">
                  <pre className="whitespace-pre-wrap">
                    {formatValue(output)}
                  </pre>
                </div>
              )}

              {state === "output-error" && errorText && (
                <div className="text-xs text-red-500">{errorText}</div>
              )}

              {state === "input-streaming" && (
                <div className="text-muted-foreground text-xs">
                  Processing...
                </div>
              )}
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  );
};

export { Tool };
export type { ToolPartType };

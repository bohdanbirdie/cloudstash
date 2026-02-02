import { type DynamicToolUIPart, type ToolUIPart, type UITools } from "ai";
import { getToolName } from "ai";
import { Match } from "effect";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  Loader2,
  Settings,
  ShieldQuestion,
  XCircle,
  XOctagon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { LinkDeleteConfirmation } from "@/components/chat/link-delete-confirmation";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type ToolPartType = ToolUIPart<UITools> | DynamicToolUIPart;
type ToolState = ToolPartType["state"];

const APPROVAL = {
  NO: "No, denied.",
  YES: "Yes, confirmed.",
} as const;

export type ToolProps = {
  toolPart: ToolPartType;
  defaultOpen?: boolean;
  className?: string;
  onApprove?: (toolCallId: string, toolName: string) => void;
  onReject?: (toolCallId: string, toolName: string) => void;
  requiresConfirmation?: boolean;
};

const Tool = ({
  toolPart,
  defaultOpen = false,
  className,
  onApprove,
  onReject,
  requiresConfirmation = false,
}: ToolProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const { state } = toolPart;
  const output = "output" in toolPart ? toolPart.output : undefined;
  const errorText = "errorText" in toolPart ? toolPart.errorText : undefined;
  const toolName = getToolName(toolPart);
  const toolCallId = "toolCallId" in toolPart ? toolPart.toolCallId : undefined;
  const input = "input" in toolPart ? toolPart.input : undefined;

  const needsConfirmation =
    requiresConfirmation && state === "input-available" && toolCallId;

  const stateIcon = getStateIcon(state as ToolState, !!needsConfirmation);
  const linkIds = extractLinkIds(toolName, input);

  const handleApprove = () => {
    if (toolCallId && onApprove) {
      onApprove(toolCallId, toolName);
    }
  };

  const handleReject = () => {
    if (toolCallId && onReject) {
      onReject(toolCallId, toolName);
    }
  };

  const hasExpandableContent =
    output !== undefined ||
    state === "input-streaming" ||
    (state === "output-error" && errorText);

  const expandableContent = getExpandableContent(
    state as ToolState,
    output,
    errorText
  );

  const renderMode = getRenderMode(
    !!needsConfirmation,
    toolName,
    linkIds
  );

  return Match.value(renderMode).pipe(
    Match.when({ type: "delete-confirmation" }, ({ linkIds }) => (
      <LinkDeleteConfirmation
        linkIds={linkIds}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    )),
    Match.when({ type: "fallback-confirmation" }, () => (
      <div
        className={cn(
          "border-amber-500/50 bg-amber-500/5 overflow-hidden rounded-md border",
          className
        )}
      >
        <div className="p-3 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-500" />
            <span className="font-medium text-sm">Confirm {toolName}?</span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-8"
              onClick={handleReject}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="flex-1 h-8"
              onClick={handleApprove}
            >
              Confirm
            </Button>
          </div>
        </div>
      </div>
    )),
    Match.orElse(() => (
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
              {stateIcon}
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
              <div className="bg-background p-2">{expandableContent}</div>
            </CollapsibleContent>
          )}
        </Collapsible>
      </div>
    ))
  );
};

export { Tool, APPROVAL };
export type { ToolPartType };

const ICON_CLASS = "size-3";

type RenderMode =
  | { type: "delete-confirmation"; linkIds: string[] }
  | { type: "fallback-confirmation" }
  | { type: "default" };

const getStateIcon = (state: ToolState, needsConfirmation: boolean): ReactNode =>
  Match.value(state).pipe(
    Match.when("input-streaming", () => (
      <Loader2 className={cn(ICON_CLASS, "animate-spin text-blue-500")} />
    )),
    Match.when("input-available", () =>
      needsConfirmation ? (
        <AlertTriangle className={cn(ICON_CLASS, "text-amber-500")} />
      ) : (
        <Settings className={cn(ICON_CLASS, "text-orange-500")} />
      )
    ),
    Match.whenOr("approval-requested", "approval-responded", () => (
      <ShieldQuestion className={cn(ICON_CLASS, "text-yellow-500")} />
    )),
    Match.when("output-available", () => (
      <CheckCircle className={cn(ICON_CLASS, "text-green-500")} />
    )),
    Match.when("output-error", () => (
      <XCircle className={cn(ICON_CLASS, "text-red-500")} />
    )),
    Match.when("output-denied", () => (
      <XOctagon className={cn(ICON_CLASS, "text-red-500")} />
    )),
    Match.orElse(() => (
      <Settings className={cn(ICON_CLASS, "text-muted-foreground")} />
    ))
  );

const extractLinkIds = (toolName: string, input: unknown): string[] =>
  Match.value(toolName).pipe(
    Match.when("deleteLink", () => {
      const id = (input as { id?: string })?.id;
      return id ? [id] : [];
    }),
    Match.when("deleteLinks", () => (input as { ids?: string[] })?.ids ?? []),
    Match.orElse(() => [])
  );

const formatValue = (value: unknown): string =>
  Match.value(value).pipe(
    Match.when(Match.null, () => "null"),
    Match.when(Match.undefined, () => "undefined"),
    Match.when(Match.string, (s) => s),
    Match.when(Match.record, (r) => JSON.stringify(r, null, 2)),
    Match.orElse((v) => String(v))
  );

const getExpandableContent = (
  state: ToolState,
  output: unknown,
  errorText: string | undefined
): ReactNode =>
  Match.value(state).pipe(
    Match.when("input-streaming", () => (
      <div className="text-muted-foreground text-xs">Processing...</div>
    )),
    Match.when("output-error", () =>
      errorText ? <div className="text-xs text-red-500">{errorText}</div> : null
    ),
    Match.orElse(() =>
      output !== undefined ? (
        <div className="max-h-40 overflow-auto font-mono text-xs">
          <pre className="whitespace-pre-wrap">{formatValue(output)}</pre>
        </div>
      ) : null
    )
  );

const getRenderMode = (
  needsConfirmation: boolean,
  toolName: string,
  linkIds: string[]
): RenderMode => {
  if (!needsConfirmation) return { type: "default" };

  const isDeleteTool = toolName === "deleteLink" || toolName === "deleteLinks";
  if (isDeleteTool && linkIds.length > 0) {
    return { type: "delete-confirmation", linkIds };
  }

  return { type: "fallback-confirmation" };
};

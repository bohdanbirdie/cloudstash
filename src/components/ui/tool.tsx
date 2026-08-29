import type { DynamicToolUIPart, ToolUIPart } from "ai";
import { getToolName } from "ai";
import { Match } from "effect";
import { ChevronDownIcon, ShieldQuestionIcon } from "lucide-react";
import { useState } from "react";

import { LinkDeleteConfirmation } from "@/components/chat/link-delete-confirmation";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type ToolPartType = ToolUIPart | DynamicToolUIPart;

export type ToolProps = {
  toolPart: ToolPartType;
  className?: string;
  onApprove?: (approvalId: string) => void;
  onReject?: (approvalId: string) => void;
};

const TOOL_LABELS: Readonly<Record<string, string>> = {
  completeLink: "mark link as done",
  completeLinks: "mark links as done",
  deleteLink: "move link to archive",
  deleteLinks: "move links to archive",
  restoreLink: "restore link",
  saveLink: "save link",
  uncompleteLink: "mark link as unread",
};

const TOOL_ACTIVITY_LABELS: Readonly<Record<string, string>> = {
  completeLink: "Updating your link",
  completeLinks: "Updating your links",
  deleteLink: "Moving the link to archive",
  deleteLinks: "Moving links to archive",
  getInboxLinks: "Checking your inbox",
  getLink: "Opening link details",
  getStats: "Checking your library",
  listRecentLinks: "Checking recent links",
  restoreLink: "Restoring the link",
  saveLink: "Saving the link",
  searchLinks: "Searching your library",
  uncompleteLink: "Updating your link",
};

const TOOL_COMPLETED_LABELS: Readonly<Record<string, string>> = {
  completeLink: "Marked link as done",
  completeLinks: "Marked links as done",
  deleteLink: "Moved link to archive",
  deleteLinks: "Moved links to archive",
  getInboxLinks: "Checked your inbox",
  getLink: "Opened link details",
  getStats: "Checked your library",
  listRecentLinks: "Checked recent links",
  restoreLink: "Restored link",
  saveLink: "Saved link",
  searchLinks: "Searched your library",
  uncompleteLink: "Marked link as unread",
};

const READ_TOOLS = new Set([
  "getInboxLinks",
  "getLink",
  "getStats",
  "listRecentLinks",
  "searchLinks",
]);

export function getToolActivityLabel(toolPart: ToolPartType): string {
  return (
    TOOL_ACTIVITY_LABELS[getToolName(toolPart)] ?? "Working with your library"
  );
}

export function isActiveToolPart(toolPart: ToolPartType): boolean {
  return Match.value(toolPart).pipe(
    Match.when({ state: "input-streaming" }, () => true),
    Match.when({ state: "input-available" }, () => true),
    Match.when(
      { state: "approval-responded" },
      (part) => part.approval.approved
    ),
    Match.orElse(() => false)
  );
}

export function isApprovalToolPart(
  toolPart: ToolPartType
): toolPart is Extract<ToolPartType, { state: "approval-requested" }> {
  return Match.value(toolPart).pipe(
    Match.when({ state: "approval-requested" }, () => true),
    Match.orElse(() => false)
  );
}

export function isTerminalToolPart(toolPart: ToolPartType): boolean {
  return Match.value(toolPart).pipe(
    Match.when({ state: "output-available" }, () => true),
    Match.when({ state: "output-error" }, () => true),
    Match.when({ state: "output-denied" }, () => true),
    Match.orElse(() => false)
  );
}

export function Tool({ toolPart, className, onApprove, onReject }: ToolProps) {
  const toolName = getToolName(toolPart);

  return Match.value(toolPart).pipe(
    Match.when({ state: "approval-requested" }, (part) =>
      renderApproval(part, toolName, className, onApprove, onReject)
    ),
    Match.when(
      (part) => isTerminalToolPart(part),
      (part) => <ToolRunSummary toolParts={[part]} className={className} />
    ),
    Match.orElse(() => null)
  );
}

export function ToolRunSummary({
  toolParts,
  className,
}: {
  toolParts: ToolPartType[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rawItems = toolParts.filter(isTerminalToolPart).map(getToolSummaryItem);
  const items = groupSequentialToolSummaryItems(rawItems);

  if (items.length === 0) return null;

  const firstItem = items[0];
  const remainingCount = rawItems.length - 1;
  const hasDetails = items.length > 1;
  const aggregateStatus = Match.value(items).pipe(
    Match.when(
      (values) => values.some((item) => item.status === "error"),
      () => "error" as const
    ),
    Match.when(
      (values) => values.some((item) => item.status === "cancelled"),
      () => "cancelled" as const
    ),
    Match.orElse(() => "success" as const)
  );
  const label = hasDetails
    ? getToolRunLabel(items, aggregateStatus, remainingCount)
    : firstItem.label;

  if (!hasDetails) {
    return (
      <div
        role={aggregateStatus === "error" ? "alert" : "status"}
        className={cn(
          "min-h-6 w-fit max-w-full text-sm leading-6 text-muted-foreground",
          className
        )}
      >
        <span>
          {label}
          {firstItem.detail ? `. ${firstItem.detail}` : null}
        </span>
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      {aggregateStatus === "error" && (
        <span role="alert" className="sr-only">
          {getToolRunErrorAnnouncement(items)}
        </span>
      )}
      <CollapsibleTrigger className="group -ms-1.5 flex min-h-6 max-w-full items-center gap-1.5 rounded-md px-1.5 text-sm text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30">
        <span className="truncate">{label}</span>
        <ChevronDownIcon
          aria-hidden="true"
          className={cn("size-3 shrink-0 transition-transform duration-150", {
            "rotate-180": open,
          })}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="ms-2 mt-1 grid gap-1 border-s border-border ps-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="min-h-6 min-w-0 text-sm text-muted-foreground"
            >
              <span className="min-w-0 leading-5">
                <span className="block truncate text-foreground/80">
                  {item.label}
                </span>
                {item.detail && (
                  <span className="block text-muted-foreground">
                    {item.detail}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}

export type { ToolPartType };

function getToolActionLabel(toolPart: ToolPartType, toolName: string): string {
  const title = toolPart.title?.trim();
  return Match.value(title).pipe(
    Match.when(
      (value): value is string => typeof value === "string" && value.length > 0,
      (value) => value.toLocaleLowerCase()
    ),
    Match.orElse(
      () =>
        TOOL_LABELS[toolName] ??
        toolName.replaceAll(/([a-z])([A-Z])/g, "$1 $2").toLocaleLowerCase()
    )
  );
}

function getToolErrorMessage(): string {
  return "Please try again.";
}

type ToolSummaryStatus = "success" | "error" | "cancelled";

type ToolSummaryItem = {
  id: string;
  baseLabel: string;
  label: string;
  status: ToolSummaryStatus;
  toolName: string;
  count: number;
  detail?: string;
};

function getToolSummaryItem(toolPart: ToolPartType): ToolSummaryItem {
  const toolName = getToolName(toolPart);

  return Match.value(toolPart).pipe(
    Match.when({ state: "output-error" }, (part) => ({
      id: part.toolCallId,
      baseLabel: getToolFailureLabel(toolName),
      label: getToolFailureLabel(toolName),
      status: "error" as const,
      toolName,
      count: 1,
      detail: getToolErrorMessage(),
    })),
    Match.when({ state: "output-denied" }, (part) => ({
      id: part.toolCallId,
      baseLabel: getToolCancelledLabel(toolName),
      label: getToolCancelledLabel(toolName),
      status: "cancelled" as const,
      toolName,
      count: 1,
    })),
    Match.orElse((part) => {
      const label = getToolCompletedLabel(toolName, part.input);
      return {
        id: part.toolCallId,
        baseLabel: label,
        label,
        status: "success" as const,
        toolName,
        count: 1,
      };
    })
  );
}

function groupSequentialToolSummaryItems(
  items: ToolSummaryItem[]
): ToolSummaryItem[] {
  return items.reduce<ToolSummaryItem[]>((groups, item) => {
    const previous = groups.at(-1);
    if (
      previous?.toolName === item.toolName &&
      previous.status === item.status &&
      previous.baseLabel === item.baseLabel &&
      previous.detail === item.detail
    ) {
      groups[groups.length - 1] = {
        ...previous,
        count: previous.count + 1,
        label: `${previous.baseLabel} · ${previous.count + 1}`,
      };
      return groups;
    }
    groups.push(item);
    return groups;
  }, []);
}

function getToolRunLabel(
  items: ToolSummaryItem[],
  aggregateStatus: ToolSummaryStatus,
  remainingCount: number
): string {
  return Match.value(aggregateStatus).pipe(
    Match.when("error", () => {
      const failedCount = items.filter(
        (item) => item.status === "error"
      ).length;
      return `${items.length} actions · ${failedCount} failed`;
    }),
    Match.when("cancelled", () => {
      const cancelledCount = items.filter(
        (item) => item.status === "cancelled"
      ).length;
      return `${items.length} actions · ${cancelledCount} cancelled`;
    }),
    Match.orElse(() => `${items[0].label} · ${remainingCount} more`)
  );
}

function getToolRunErrorAnnouncement(items: ToolSummaryItem[]): string {
  const failure = items.find((item) => item.status === "error");
  return Match.value(failure).pipe(
    Match.when(Match.undefined, () => "An action failed."),
    Match.orElse((item) =>
      Match.value(item.detail).pipe(
        Match.when(Match.undefined, () => `${item.label}.`),
        Match.orElse((detail) => `${item.label}. ${detail}`)
      )
    )
  );
}

function getToolCompletedLabel(toolName: string, input: unknown): string {
  return Match.value(toolName).pipe(
    Match.when("deleteLink", () => "Moved link to archive"),
    Match.when("deleteLinks", () => {
      const linkCount = extractLinkIds(toolName, input).length;
      return getArchiveSuccessMessage(linkCount);
    }),
    Match.orElse(
      () =>
        TOOL_COMPLETED_LABELS[toolName] ??
        `Completed ${toolName.replaceAll(/([a-z])([A-Z])/g, "$1 $2").toLocaleLowerCase()}`
    )
  );
}

function getToolFailureLabel(toolName: string): string {
  return Match.value(toolName).pipe(
    Match.when("saveLink", () => "Couldn’t save link"),
    Match.when(
      (name) => READ_TOOLS.has(name),
      () => "Couldn’t check your library"
    ),
    Match.orElse(() => "Couldn’t update your library")
  );
}

function getToolCancelledLabel(toolName: string): string {
  const action = TOOL_LABELS[toolName];
  return Match.value(action).pipe(
    Match.when(Match.undefined, () => "Action cancelled"),
    Match.orElse((value) => `Cancelled ${value}`)
  );
}

function getArchiveSuccessMessage(linkCount: number): string {
  return Match.value(linkCount).pipe(
    Match.when(
      (count) => count > 1,
      (count) => `Moved ${count} links to archive`
    ),
    Match.orElse(() => "Moved link to archive")
  );
}

function isArchiveTool(toolName: string): boolean {
  return toolName === "deleteLink" || toolName === "deleteLinks";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return Match.value(value).pipe(
    Match.when(Match.record, (record) => record),
    Match.orElse(() => undefined)
  );
}

function extractLinkIds(toolName: string, input: unknown): string[] {
  const record = asRecord(input);

  return Match.value(toolName).pipe(
    Match.when("deleteLink", () =>
      Match.value(record?.id).pipe(
        Match.when(Match.string, (id) => [id]),
        Match.orElse(() => [])
      )
    ),
    Match.when("deleteLinks", () =>
      Match.value(record?.ids).pipe(
        Match.when(Array.isArray, (ids) =>
          ids.filter((id): id is string => typeof id === "string")
        ),
        Match.orElse(() => [])
      )
    ),
    Match.orElse(() => [])
  );
}

function renderApproval(
  toolPart: Extract<ToolPartType, { state: "approval-requested" }>,
  toolName: string,
  className: string | undefined,
  onApprove: ((approvalId: string) => void) | undefined,
  onReject: ((approvalId: string) => void) | undefined
) {
  const approvalId = toolPart.approval.id;
  const linkIds = extractLinkIds(toolName, toolPart.input);

  return Match.value({
    hasLinks: linkIds.length > 0,
    isArchive: isArchiveTool(toolName),
  }).pipe(
    Match.when({ hasLinks: true, isArchive: true }, () => (
      <LinkDeleteConfirmation
        linkIds={linkIds}
        onApprove={() => onApprove?.(approvalId)}
        onReject={() => onReject?.(approvalId)}
      />
    )),
    Match.orElse(() => {
      const action = getToolActionLabel(toolPart, toolName);
      return (
        <div className={cn("rounded-lg bg-muted/50 p-3", className)}>
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldQuestionIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
            <span>Allow {action}?</span>
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 flex-1"
              onClick={() => onReject?.(approvalId)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 flex-1"
              onClick={() => onApprove?.(approvalId)}
            >
              Allow {action}
            </Button>
          </div>
        </div>
      );
    })
  );
}

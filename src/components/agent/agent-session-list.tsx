import { PlusIcon, Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { ChatSession } from "@/cf-worker/chat-agent/sessions";
import type { AssistantCreditStatus } from "@/cf-worker/chat-agent/usage";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSettingsDialog } from "@/stores/settings-dialog-store";

import { useAgentSessions } from "./agent-sessions-provider";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});
const resetDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const sessionDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateFormatter.format(date);
};

export function AgentSessionList() {
  const openSettings = useSettingsDialog((state) => state.openAt);
  const {
    sessions,
    assistantCredits,
    selectSession,
    createSession,
    deleteSession,
    retrySessions,
    error,
    isLoading,
  } = useAgentSessions();

  return (
    <AgentSessionListView
      sessions={sessions}
      assistantCredits={assistantCredits}
      error={error}
      isLoading={isLoading}
      onSelect={selectSession}
      onCreate={createSession}
      onDelete={deleteSession}
      onOpenUsage={() => openSettings("account")}
      onRetry={retrySessions}
    />
  );
}

export function AgentSessionListView({
  sessions,
  assistantCredits,
  error,
  isLoading = false,
  onSelect,
  onCreate,
  onDelete,
  onOpenUsage,
  onRetry,
}: {
  sessions: readonly ChatSession[];
  assistantCredits?: AssistantCreditStatus;
  error?: Error;
  isLoading?: boolean;
  onSelect: (agentName: string) => void;
  onCreate: () => Promise<void>;
  onDelete: (agentName: string) => Promise<void>;
  onOpenUsage: () => void;
  onRetry: () => Promise<void>;
}) {
  const runAction = (action: () => Promise<void>) => {
    void action().catch(() => toast.error("Couldn’t update chats. Try again."));
  };

  return (
    <TooltipProvider delay={400}>
      <div className="flex h-full flex-col">
        <header className="flex h-8 shrink-0 items-center justify-between border-b border-border px-1.5">
          <div className="flex min-w-0 items-center">
            <span className="px-1 text-xs font-medium">Chats</span>
            {!isLoading && !error && assistantCredits && (
              <AssistantCreditsButton
                credits={assistantCredits}
                onOpenUsage={onOpenUsage}
              />
            )}
          </div>
          {sessions.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="New chat"
              onClick={() => runAction(onCreate)}
            >
              <PlusIcon />
            </Button>
          )}
        </header>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner
              aria-label="Loading chats"
              className="text-muted-foreground"
            />
          </div>
        ) : error ? (
          <div
            role="alert"
            className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
          >
            <p className="text-xs text-muted-foreground">
              Couldn’t load your chats.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => runAction(onRetry)}
            >
              Retry
            </Button>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="space-y-1">
              <p className="text-xs font-medium">No chats yet</p>
              <p className="text-xs text-muted-foreground">
                Start one to ask about your saved links.
              </p>
            </div>
            <Button type="button" onClick={() => runAction(onCreate)}>
              <PlusIcon data-icon="inline-start" />
              New chat
            </Button>
          </div>
        ) : (
          <ul className="scroll-fade min-h-0 flex-1 overflow-y-auto p-1">
            {sessions.map((session) => (
              <SessionListItem
                key={session.agentName}
                session={session}
                onSelect={onSelect}
                onDelete={onDelete}
                runAction={runAction}
              />
            ))}
          </ul>
        )}
      </div>
    </TooltipProvider>
  );
}

function AssistantCreditsButton({
  credits,
  onOpenUsage,
}: {
  credits: AssistantCreditStatus;
  onOpenUsage: () => void;
}) {
  const remaining = credits.remaining.toLocaleString();
  const limit = credits.limit.toLocaleString();
  const resetsAt = resetDateFormatter.format(new Date(credits.resetsAt));

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="inline-flex min-h-6 cursor-pointer items-center gap-1.5 rounded-sm px-1 text-[0.6875rem] text-muted-foreground tabular-nums outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label={`${remaining} of ${limit} Assistant credits left. Open usage settings.`}
            onClick={onOpenUsage}
          />
        }
      >
        <span aria-hidden className="h-3 w-px bg-border" />
        <span>
          {remaining} / {limit} credits left
        </span>
      </TooltipTrigger>
      <TooltipContent>Resets {resetsAt}</TooltipContent>
    </Tooltip>
  );
}

function SessionListItem({
  session,
  onSelect,
  onDelete,
  runAction,
}: {
  session: ChatSession;
  onSelect: (agentName: string) => void;
  onDelete: (agentName: string) => Promise<void>;
  runAction: (action: () => Promise<void>) => void;
}) {
  const titleRef = useRef<HTMLSpanElement>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  return (
    <li className="group/session relative flex items-center rounded-md hover:bg-muted/60 focus-within:bg-muted/60">
      <Tooltip
        open={tooltipOpen}
        onOpenChange={(open) => {
          const title = titleRef.current;
          setTooltipOpen(
            open && title !== null && title.scrollWidth > title.clientWidth
          );
        }}
      >
        <TooltipTrigger
          render={
            <button
              type="button"
              className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              onClick={() => onSelect(session.agentName)}
            />
          }
        >
          <span
            ref={titleRef}
            className="min-w-0 flex-1 truncate text-xs font-medium"
          >
            {session.title}
          </span>
          <time
            dateTime={session.updatedAt}
            className="shrink-0 text-xs text-muted-foreground transition-opacity group-hover/session:opacity-0 group-focus-within/session:opacity-0 [@media(hover:none)]:opacity-0"
          >
            {sessionDate(session.updatedAt)}
          </time>
        </TooltipTrigger>
        <TooltipContent
          align="start"
          arrowClassName="data-[side=bottom]:left-5! data-[side=top]:left-5!"
          className="text-pretty"
        >
          {session.title}
        </TooltipContent>
      </Tooltip>

      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="absolute inset-e-1 top-1/2 -translate-y-1/2 text-muted-foreground opacity-0 group-hover/session:opacity-100 group-focus-within/session:opacity-100 [@media(hover:none)]:opacity-100"
              aria-label={`Delete ${session.title}`}
            />
          }
        >
          <Trash2Icon />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes “{session.title}”. Your saved links won’t be
              affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => runAction(() => onDelete(session.agentName))}
            >
              Delete chat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

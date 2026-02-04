import { type UIMessage } from "@ai-sdk/react";
import { getToolName, isToolUIPart } from "ai";
import { Match } from "effect";
import { MessageSquareIcon } from "lucide-react";
import { useCallback } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/chat/conversation";
import { ChatEditor } from "@/components/chat/lexical/chat-editor";
import { Thinking } from "@/components/ui/thinking";
import { APPROVAL } from "@/components/ui/tool";
import { useWorkspaceChat } from "@/hooks/use-workspace-chat";
import { cn } from "@/lib/utils";
import { SLASH_COMMANDS, type SlashCommand } from "@/shared/slash-commands";
import { requiresConfirmation } from "@/shared/tool-config";

import { ChatMessage } from "./chat-message";
import { EmptyState } from "./empty-state";
import { ErrorMessage } from "./error-message";
import { UsageIndicator } from "./usage-indicator";

interface ChatContentProps {
  workspaceId: string;
}

export function ChatContent({ workspaceId }: ChatContentProps) {
  const {
    messages,
    sendMessage,
    clearHistory,
    status,
    isConnected,
    addToolOutput,
    error,
    usage,
  } = useWorkspaceChat(workspaceId);

  const isStreaming = status === "streaming";
  const hasError = status === "error";
  const hasPendingConfirmation = checkPendingConfirmation(messages);

  const handleSubmit = useCallback(
    (text: string) => {
      if (!isConnected || isStreaming || hasPendingConfirmation) return;
      sendMessage({ role: "user", parts: [{ type: "text", text }] });
    },
    [isConnected, isStreaming, hasPendingConfirmation, sendMessage]
  );

  const handleSlashCommand = useCallback(
    (command: SlashCommand, args: string) => {
      if (command.handler === "client") {
        if (command.name === "clear") {
          clearHistory();
          return;
        }
        if (command.name === "help") {
          const helpText = SLASH_COMMANDS.map(
            (c) => `/${c.name}${c.args ? ` ${c.args}` : ""} - ${c.description}`
          ).join("\n");
          sendMessage({
            role: "user",
            parts: [{ type: "text", text: `/help\n\n${helpText}` }],
          });
          return;
        }
      }

      const naturalLanguage = slashCommandToNaturalLanguage(command, args);
      sendMessage({
        role: "user",
        parts: [{ type: "text", text: naturalLanguage }],
      });
    },
    [clearHistory, sendMessage]
  );

  const handleApprove = useCallback(
    (toolCallId: string, toolName: string) => {
      addToolOutput({ toolCallId, toolName, output: APPROVAL.YES });
    },
    [addToolOutput]
  );

  const handleReject = useCallback(
    (toolCallId: string, toolName: string) => {
      addToolOutput({ toolCallId, toolName, output: APPROVAL.NO });
    },
    [addToolOutput]
  );

  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
        <div className="flex items-center gap-2">
          <MessageSquareIcon className="size-4" />
          <span className="font-medium text-sm">Agent</span>
          {!isConnected && (
            <span className="size-2 rounded-full bg-yellow-500 animate-pulse" />
          )}
        </div>
        {usage && <UsageIndicator usage={usage} />}
      </header>
      <div className="relative flex flex-col flex-1 min-h-0 px-3 pb-0">
        <Conversation>
          <ConversationContent className="pb-24">
            {messages.length === 0 && <EmptyState />}
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            ))}
            <Thinking isLoading={isStreaming} />
            {hasError && <ErrorMessage error={error} />}
          </ConversationContent>
          <ConversationScrollButton className="bottom-28" />
        </Conversation>

        <div
          className={cn(
            "absolute bottom-0 left-0 right-0 bg-background border-input rounded-xl border shadow-xs mb-3",
            hasPendingConfirmation && "opacity-60"
          )}
        >
          <ChatEditor
            onSubmit={handleSubmit}
            onSlashCommand={handleSlashCommand}
            disabled={!isConnected || isStreaming || hasPendingConfirmation}
            placeholder={getPlaceholder(hasPendingConfirmation)}
          />
        </div>
      </div>
    </>
  );
}

const checkPendingConfirmation = (messages: UIMessage[]): boolean =>
  messages.some((m) =>
    m.parts?.some(
      (p) =>
        isToolUIPart(p) &&
        p.state === "input-available" &&
        requiresConfirmation(getToolName(p))
    )
  );

const getPlaceholder = (hasPendingConfirmation: boolean): string =>
  Match.value(hasPendingConfirmation).pipe(
    Match.when(true, () => "Respond to the confirmation above..."),
    Match.orElse(() => "Ask about your links...")
  );

const slashCommandToNaturalLanguage = (
  command: SlashCommand,
  args: string
): string => {
  switch (command.name) {
    case "search":
      return args ? `Search my links for "${args}"` : "Search my links";
    case "save":
      return args ? `Save this link: ${args}` : "Save a link";
    case "recent":
      return args
        ? `Show me my ${args} most recent links`
        : "Show me my recent links";
    default:
      return `/${command.name}${args ? ` ${args}` : ""}`;
  }
};

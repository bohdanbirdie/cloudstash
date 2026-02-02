import type { UIMessage } from "@ai-sdk/react";
import { getToolName, isToolUIPart } from "ai";
import { Match } from "effect";
import { AlertCircle } from "lucide-react";
import { useCallback } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/chat/conversation";
import { ChatEditor } from "@/components/chat/lexical/chat-editor";
import { MessageContent } from "@/components/ui/message";
import { Thinking } from "@/components/ui/thinking";
import { Tool, APPROVAL, type ToolPartType } from "@/components/ui/tool";
import { useWorkspaceChat } from "@/hooks/use-workspace-chat";
import { cn } from "@/lib/utils";
import { requiresConfirmation } from "@/shared/tool-config";
import { SLASH_COMMANDS, type SlashCommand } from "@/shared/slash-commands";

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

      // Convert slash command to natural language for the AI
      const naturalLanguage = slashCommandToNaturalLanguage(command, args);
      sendMessage({ role: "user", parts: [{ type: "text", text: naturalLanguage }] });
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
    <div className="relative flex flex-col h-full min-h-0 gap-2">
      <ConnectionStatus isConnected={isConnected} />

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
  );
}

const ConnectionStatus = ({ isConnected }: { isConnected: boolean }) => (
  <div className="flex items-center gap-2 text-xs">
    <span
      className={cn(
        "size-2 rounded-full",
        isConnected ? "bg-green-500" : "bg-yellow-500"
      )}
    />
    <span className="text-muted-foreground">
      {isConnected ? "Connected" : "Connecting..."}
    </span>
  </div>
);

const EmptyState = () => (
  <div className="text-center text-muted-foreground text-sm py-8">
    Start a conversation...
  </div>
);

type ChatMessageProps = {
  message: UIMessage;
  onApprove: (toolCallId: string, toolName: string) => void;
  onReject: (toolCallId: string, toolName: string) => void;
};

const ChatMessage = ({ message, onApprove, onReject }: ChatMessageProps) => {
  const isUser = message.role === "user";
  const { textContent, toolParts } = parseMessageParts(message.parts);

  return (
    <div className={cn("flex", isUser && "justify-end")}>
      <div className="flex flex-col gap-1 max-w-[85%] min-w-0">
        {textContent && (
          <MessageContent
            markdown
            className={cn(isUser && "bg-primary text-primary-foreground")}
          >
            {textContent}
          </MessageContent>
        )}
        {toolParts.map((part, i) => (
          <Tool
            key={i}
            toolPart={part}
            requiresConfirmation={requiresConfirmation(getToolName(part))}
            onApprove={onApprove}
            onReject={onReject}
          />
        ))}
      </div>
    </div>
  );
};

const ErrorMessage = ({ error }: { error: Error | undefined }) => {
  const message = getErrorMessage(error);

  return (
    <div className="flex gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
      <AlertCircle className="size-4 flex-shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
};

const checkPendingConfirmation = (messages: UIMessage[]): boolean =>
  messages.some((m) =>
    m.parts?.some(
      (p) =>
        isToolUIPart(p) &&
        p.state === "input-available" &&
        requiresConfirmation(getToolName(p))
    )
  );

type TextPart = { type: "text"; text: string };

const parseMessageParts = (
  parts: UIMessage["parts"]
): { textContent: string; toolParts: ToolPartType[] } => {
  const textParts = parts.filter((p): p is TextPart => p.type === "text");
  const toolParts = parts.filter(isToolUIPart);
  const textContent = textParts.map((p) => p.text).join("\n");

  return { textContent, toolParts };
};

const getPlaceholder = (hasPendingConfirmation: boolean): string =>
  Match.value(hasPendingConfirmation).pipe(
    Match.when(true, () => "Respond to the confirmation above..."),
    Match.orElse(() => "Ask about your links...")
  );

const getErrorMessage = (error: Error | undefined): string =>
  Match.value(error?.message?.toLowerCase().includes("rate limit")).pipe(
    Match.when(true, () => "Rate limit reached. Please try again in a few minutes."),
    Match.orElse(() => "Something went wrong. Please try again.")
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

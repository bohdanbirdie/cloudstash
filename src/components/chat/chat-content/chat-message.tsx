import type { UIMessage } from "@ai-sdk/react";
import { isToolUIPart } from "ai";

import { MessageContent } from "@/components/ui/message";
import {
  isApprovalToolPart,
  isTerminalToolPart,
  Tool,
  ToolRunSummary,
} from "@/components/ui/tool";
import type { ToolPartType } from "@/components/ui/tool";
import { cn } from "@/lib/utils";

type ChatMessageProps = {
  message: UIMessage;
  onApprove: (approvalId: string) => void;
  onReject: (approvalId: string) => void;
  showToolSummary?: boolean;
};

export const ChatMessage = ({
  message,
  onApprove,
  onReject,
  showToolSummary = true,
}: ChatMessageProps) => {
  const isUser = message.role === "user";
  const { textContent, toolParts } = parseMessageParts(message.parts);
  const approvalParts = toolParts.filter(isApprovalToolPart);
  const terminalParts = toolParts.filter(isTerminalToolPart);
  const visibleTerminalParts = showToolSummary ? terminalParts : [];

  if (
    !textContent &&
    approvalParts.length === 0 &&
    visibleTerminalParts.length === 0
  ) {
    return null;
  }

  return (
    <div className={cn("flex", { "justify-end": isUser })}>
      <div
        className={cn("flex min-w-0 flex-col gap-2", {
          "max-w-[85%]": isUser,
          "w-full": !isUser,
        })}
      >
        <ToolRunSummary toolParts={visibleTerminalParts} />
        {textContent && (
          <MessageContent
            markdown={!isUser}
            className={cn({
              "bg-muted text-foreground": isUser,
              "bg-transparent p-0": !isUser,
            })}
          >
            {textContent}
          </MessageContent>
        )}
        {approvalParts.map((part) => (
          <Tool
            key={part.toolCallId}
            toolPart={part}
            onApprove={onApprove}
            onReject={onReject}
          />
        ))}
      </div>
    </div>
  );
};

type TextPart = { type: "text"; text: string };

const parseMessageParts = (
  parts: UIMessage["parts"]
): { textContent: string; toolParts: ToolPartType[] } => {
  const textParts = parts.filter((p): p is TextPart => p.type === "text");
  const toolParts = parts.filter(isToolUIPart);
  const textContent = textParts.map((p) => p.text).join("\n");

  return { textContent, toolParts };
};

import { type UIMessage } from "@ai-sdk/react";
import { getToolName, isToolUIPart } from "ai";

import { MessageContent } from "@/components/ui/message";
import { Tool, type ToolPartType } from "@/components/ui/tool";
import { cn } from "@/lib/utils";
import { requiresConfirmation } from "@/shared/tool-config";

type ChatMessageProps = {
  message: UIMessage;
  onApprove: (toolCallId: string, toolName: string) => void;
  onReject: (toolCallId: string, toolName: string) => void;
};

export const ChatMessage = ({
  message,
  onApprove,
  onReject,
}: ChatMessageProps) => {
  const isUser = message.role === "user";
  const { textContent, toolParts } = parseMessageParts(message.parts);

  return (
    <div className={cn("flex", { "justify-end": isUser })}>
      <div
        className={cn("flex flex-col gap-1 min-w-0", { "max-w-[85%]": isUser })}
      >
        {textContent && (
          <MessageContent
            markdown={!isUser}
            className={cn({
              "bg-primary text-primary-foreground": isUser,
              "bg-transparent p-0": !isUser,
            })}
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

type TextPart = { type: "text"; text: string };

const parseMessageParts = (
  parts: UIMessage["parts"]
): { textContent: string; toolParts: ToolPartType[] } => {
  const textParts = parts.filter((p): p is TextPart => p.type === "text");
  const toolParts = parts.filter(isToolUIPart);
  const textContent = textParts.map((p) => p.text).join("\n");

  return { textContent, toolParts };
};

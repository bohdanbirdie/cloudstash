import type { UIMessage } from "@ai-sdk/react";
import { isToolUIPart } from "ai";

import { MessageContent } from "@/components/ui/message";
import { Tool } from "@/components/ui/tool";
import type { ToolPartType } from "@/components/ui/tool";
import { cn } from "@/lib/utils";

type ChatMessageProps = {
  message: UIMessage;
  onApprove: (approvalId: string) => void;
  onReject: (approvalId: string) => void;
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

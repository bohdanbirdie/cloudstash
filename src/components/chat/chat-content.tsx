import { isToolUIPart } from "ai";
import { SendIcon } from "lucide-react";
import { useState } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/chat/conversation";
import { Button } from "@/components/ui/button";
import { MessageContent } from "@/components/ui/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
} from "@/components/ui/prompt-input";
import { Thinking } from "@/components/ui/thinking";
import { Tool } from "@/components/ui/tool";
import { useWorkspaceChat } from "@/hooks/use-workspace-chat";
import { cn } from "@/lib/utils";

interface ChatContentProps {
  workspaceId: string;
}

export function ChatContent({ workspaceId }: ChatContentProps) {
  const [input, setInput] = useState("");

  const { messages, sendMessage, status, isConnected } =
    useWorkspaceChat(workspaceId);

  const isStreaming = status === "streaming";

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || !isConnected || isStreaming) return;

    await sendMessage({
      role: "user",
      parts: [{ type: "text", text }],
    });

    setInput("");
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-2">
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

      <Conversation>
        <ConversationContent>
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-8">
              Start a conversation...
            </div>
          )}
          {messages.map((message) => {
            const isUser = message.role === "user";
            const textParts = message.parts.filter(
              (p): p is { type: "text"; text: string } => p.type === "text"
            );
            const toolParts = message.parts.filter(isToolUIPart);
            const textContent = textParts.map((p) => p.text).join("\n");

            return (
              <div
                key={message.id}
                className={cn("flex", isUser && "justify-end")}
              >
                <div className="flex flex-col gap-1 max-w-[85%]">
                  {textContent && (
                    <MessageContent
                      markdown
                      className={cn(
                        isUser && "bg-primary text-primary-foreground"
                      )}
                    >
                      {textContent}
                    </MessageContent>
                  )}
                  {toolParts.map((part, i) => (
                    <Tool key={i} toolPart={part} />
                  ))}
                </div>
              </div>
            );
          })}
          <Thinking isLoading={isStreaming} />
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <PromptInput
        value={input}
        onValueChange={setInput}
        onSubmit={handleSubmit}
        isLoading={isStreaming}
        className="rounded-xl"
      >
        <PromptInputTextarea placeholder="Ask about your links..." />
        <PromptInputActions className="justify-end px-2 pb-2">
          <Button
            type="button"
            size="icon"
            className="rounded-full size-8"
            disabled={isStreaming || !isConnected || !input.trim()}
            onClick={handleSubmit}
          >
            <SendIcon className="size-4" />
          </Button>
        </PromptInputActions>
      </PromptInput>
    </div>
  );
}

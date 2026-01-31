import { MessageSquareIcon, SendIcon, Loader2Icon } from "lucide-react";
import { useState, useRef, useEffect, Suspense } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/ui/markdown";
import { useWorkspaceChat } from "@/hooks/use-workspace-chat";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface ChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ChatContent({ workspaceId }: { workspaceId: string }) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, isConnected } =
    useWorkspaceChat(workspaceId);

  const isStreaming = status === "streaming";

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !isConnected) return;

    await sendMessage({
      role: "user",
      parts: [{ type: "text", text: input }],
    });
    setInput("");
  };

  return (
    <>
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

      <div className="flex-1 overflow-y-auto min-h-[300px] space-y-3 py-2">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-8">
            Start a conversation...
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "p-3 rounded-lg text-sm",
              message.role === "user"
                ? "bg-primary text-primary-foreground ml-8"
                : "bg-muted mr-8"
            )}
          >
            {message.parts.map((part, i) => {
              if (part.type === "text") {
                return <Markdown key={i}>{part.text}</Markdown>;
              }
              if (part.type.startsWith("tool-")) {
                const toolName = part.type.replace("tool-", "");
                return (
                  <div
                    key={i}
                    className="text-xs text-muted-foreground italic mt-1"
                  >
                    Using: {toolName}
                  </div>
                );
              }
              return null;
            })}
          </div>
        ))}
        {isStreaming && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2Icon className="size-3 animate-spin" />
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your links..."
          disabled={!isConnected}
        />
        <Button
          type="submit"
          size="icon"
          disabled={isStreaming || !isConnected || !input.trim()}
        >
          <SendIcon className="size-4" />
        </Button>
      </form>
    </>
  );
}

function ChatLoading() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[300px]">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2Icon className="size-4 animate-spin" />
        Loading chat...
      </div>
    </div>
  );
}

export function ChatDialog({ open, onOpenChange }: ChatDialogProps) {
  const { orgId } = useAuth();

  if (!orgId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareIcon className="size-4" />
            Chat Assistant
          </DialogTitle>
          <DialogDescription>
            Ask questions about your links or use commands to manage them.
          </DialogDescription>
        </DialogHeader>

        {open && (
          <Suspense fallback={<ChatLoading />}>
            <ChatContent workspaceId={orgId} />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}

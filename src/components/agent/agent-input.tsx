import { getToolName, isToolUIPart } from "ai";
import { SendIcon } from "lucide-react";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { requiresConfirmation } from "@/shared/tool-config";

import {
  useAgentChat,
  useAgentConnection,
  useAgentInput,
} from "./agent-chat-provider";

interface InputFormProps {
  onSubmit: () => void;
  canSend: boolean;
  placeholder: string;
  muted?: boolean;
}

export function InputForm({
  onSubmit,
  canSend,
  placeholder,
  muted = false,
}: InputFormProps) {
  const { draft, setDraft, selectionRef, setupTextarea } = useAgentInput();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className={cn(
        "flex shrink-0 items-end gap-1 border-t border-border p-1",
        muted && "opacity-60"
      )}
    >
      <textarea
        ref={setupTextarea}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          selectionRef.current = {
            start: e.target.selectionStart,
            end: e.target.selectionEnd,
          };
        }}
        onSelect={(e) => {
          const t = e.currentTarget;
          selectionRef.current = {
            start: t.selectionStart,
            end: t.selectionEnd,
          };
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
        rows={1}
        className="flex-1 resize-none bg-transparent px-1.5 py-1 text-xs placeholder:text-muted-foreground focus:outline-none"
      />
      <Button
        type="submit"
        size="icon-xs"
        variant="ghost"
        disabled={!canSend || draft.trim().length === 0}
        aria-label="Send"
        className="[&_svg:not([class*='size-'])]:size-3"
      >
        <SendIcon />
      </Button>
    </form>
  );
}

export function AgentInput() {
  const { draft, setDraft } = useAgentInput();
  const { isConnected } = useAgentConnection();
  const { messages, status, sendMessage } = useAgentChat();

  const isStreaming = status === "streaming";
  const hasPendingConfirmation = checkPendingConfirmation(messages);
  const canSend = isConnected && !isStreaming && !hasPendingConfirmation;

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || !canSend) return;
    void sendMessage({ role: "user", parts: [{ type: "text", text }] });
    track("chat_message_sent");
    setDraft("");
  }, [draft, canSend, sendMessage, setDraft]);

  return (
    <InputForm
      onSubmit={submit}
      canSend={canSend}
      placeholder={
        hasPendingConfirmation
          ? "Respond to the confirmation above..."
          : "Ask about your links..."
      }
      muted={hasPendingConfirmation}
    />
  );
}

const checkPendingConfirmation = (
  messages: ReturnType<typeof useAgentChat>["messages"]
): boolean =>
  messages.some((m) =>
    m.parts?.some(
      (p) =>
        isToolUIPart(p) &&
        p.state === "input-available" &&
        requiresConfirmation(getToolName(p))
    )
  );

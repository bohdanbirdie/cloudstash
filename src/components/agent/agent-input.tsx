import { isToolUIPart } from "ai";
import { SendIcon } from "lucide-react";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

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
        "flex shrink-0 items-end gap-1.5 border-t border-border p-2 lg:gap-1 lg:p-1",
        { "opacity-60": muted }
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
        // 16px text on mobile keeps iOS Safari from zooming the page on focus;
        // the desktop popup keeps its compact `text-xs`.
        className="flex-1 resize-none bg-transparent px-2 py-2 text-base placeholder:text-muted-foreground focus:outline-none lg:px-1.5 lg:py-1 lg:text-xs"
      />
      <Button
        type="submit"
        size="icon-xs"
        variant="ghost"
        disabled={!canSend || draft.trim().length === 0}
        aria-label="Send"
        className="size-9 lg:size-5"
      >
        <SendIcon className="size-4 lg:size-3" />
      </Button>
    </form>
  );
}

export function AgentInput() {
  const { draft, setDraft } = useAgentInput();
  const { isConnected } = useAgentConnection();
  const { messages, isBusy, sendMessage } = useAgentChat();

  const hasPendingConfirmation = checkPendingConfirmation(messages);
  const canSend = isConnected && !isBusy && !hasPendingConfirmation;

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
    m.parts?.some((p) => isToolUIPart(p) && p.state === "approval-requested")
  );

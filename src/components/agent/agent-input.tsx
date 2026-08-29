import { isToolUIPart } from "ai";
import { ArrowUpIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";

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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const singleLineHeightRef = useRef<number | null>(null);
  const [isMultiline, setIsMultiline] = useState(false);

  const setTextareaRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      textareaRef.current = node;
      setupTextarea(node);
      if (!node) return;

      const singleLineHeight = getSingleLineHeight(node);
      const height = resizeTextarea(node);
      singleLineHeightRef.current = singleLineHeight;
      setIsMultiline(height > singleLineHeight + 1);
    },
    [setupTextarea]
  );

  const submit = useCallback(() => {
    if (!canSend || draft.trim().length === 0) return;

    onSubmit();
    setIsMultiline(false);
    resetTextarea(textareaRef.current, singleLineHeightRef.current);
  }, [canSend, draft, onSubmit]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={cn("shrink-0 border-t border-border bg-background p-1", {
        "opacity-60": muted,
      })}
    >
      <div className="relative flex min-h-8 items-end rounded-lg border border-input bg-input/20 p-1 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 dark:bg-input/30">
        <textarea
          ref={setTextareaRef}
          value={draft}
          onChange={(e) => {
            const singleLineHeight =
              singleLineHeightRef.current ??
              getSingleLineHeight(e.currentTarget);
            const height = resizeTextarea(e.currentTarget);
            singleLineHeightRef.current = singleLineHeight;
            setIsMultiline(height > singleLineHeight + 1);
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
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;

            // The production dock lives inside cmdk, which handles every
            // bubbled Enter key. Keep both submit and newline behavior owned
            // by the chat composer while it has focus.
            e.stopPropagation();
            if (e.shiftKey) return;

            e.preventDefault();
            submit();
          }}
          placeholder={placeholder}
          aria-label="Message the assistant"
          aria-keyshortcuts="Enter"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="none"
          data-gramm="false"
          data-gramm_editor="false"
          data-enable-grammarly="false"
          data-lt-active="false"
          rows={1}
          // 16px text on mobile keeps iOS Safari from zooming the page on focus;
          // the desktop popup keeps its compact density.
          className="min-h-6 max-h-24 w-full resize-none bg-transparent py-1 ps-1.5 pe-8 text-sm/4 outline-none placeholder:text-muted-foreground [@media(pointer:coarse)]:text-base [@media(pointer:coarse)]:leading-5"
        />
        <Button
          type="submit"
          size="icon-sm"
          variant="ghost"
          disabled={!canSend || draft.trim().length === 0}
          aria-label="Send"
          className={cn(
            "absolute end-1 size-6 rounded-[calc(var(--radius-lg)-0.25rem)] bg-muted text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground",
            {
              "bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary":
                canSend && draft.trim().length > 0,
              "top-1/2 -translate-y-1/2": !isMultiline,
              "bottom-1": isMultiline,
            }
          )}
        >
          <ArrowUpIcon className="size-3" strokeWidth={2} />
        </Button>
      </div>
    </form>
  );
}

function resizeTextarea(textarea: HTMLTextAreaElement): number {
  textarea.style.height = "0px";
  const height = Math.min(textarea.scrollHeight, 96);
  textarea.style.height = `${height}px`;
  textarea.style.overflowY = textarea.scrollHeight > 96 ? "auto" : "hidden";
  return height;
}

function getSingleLineHeight(textarea: HTMLTextAreaElement): number {
  const style = window.getComputedStyle(textarea);
  const lineHeight = cssPixels(style.lineHeight, 16);
  const paddingBlock =
    cssPixels(style.paddingTop, 4) + cssPixels(style.paddingBottom, 4);

  return Math.ceil(lineHeight + paddingBlock);
}

function cssPixels(value: string, fallback: number): number {
  if (!value.endsWith("px")) return fallback;

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resetTextarea(
  textarea: HTMLTextAreaElement | null,
  singleLineHeight: number | null
) {
  if (!textarea || singleLineHeight === null) return;

  textarea.style.height = `${singleLineHeight}px`;
  textarea.style.overflowY = "hidden";
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
          ? "Choose an action above"
          : "Ask about your links…"
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

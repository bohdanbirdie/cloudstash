import { ListNode, ListItemNode } from "@lexical/list";
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { ClearEditorPlugin } from "@lexical/react/LexicalClearEditorPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { $getRoot, CLEAR_EDITOR_COMMAND, type EditorState } from "lexical";
import { ArrowUp } from "lucide-react";
import { useState, useCallback, useRef } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseSlashCommand, type SlashCommand } from "@/shared/slash-commands";

import { ListShortcutPlugin } from "./plugins/list-shortcut-plugin";
import { SlashCommandPlugin } from "./plugins/slash-command-plugin";
import { SubmitPlugin } from "./plugins/submit-plugin";

type ChatEditorProps = {
  onSubmit: (text: string) => void;
  onSlashCommand?: (command: SlashCommand, args: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

const theme = {
  paragraph: "m-0",
  list: {
    ul: "list-disc ml-4 my-1",
    ol: "list-decimal ml-4 my-1",
    listitem: "",
  },
};

export function ChatEditor({
  onSubmit,
  onSlashCommand,
  disabled = false,
  placeholder = "Ask about your links...",
  className,
}: ChatEditorProps) {
  const initialConfig = {
    namespace: "ChatEditor",
    theme,
    nodes: [ListNode, ListItemNode],
    onError: (error: Error) => console.error("[ChatEditor]", error),
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <ChatEditorInner
        onSubmit={onSubmit}
        onSlashCommand={onSlashCommand}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
      />
    </LexicalComposer>
  );
}

type ChatEditorInnerProps = {
  onSubmit: (text: string) => void;
  onSlashCommand?: (command: SlashCommand, args: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

function ChatEditorInner({
  onSubmit,
  onSlashCommand,
  disabled = false,
  placeholder,
  className,
}: ChatEditorInnerProps) {
  const [editor] = useLexicalComposerContext();
  const [text, setText] = useState("");
  const [isSlashMenuOpen, setIsSlashMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleChange = useCallback((editorState: EditorState) => {
    editorState.read(() => {
      setText($getRoot().getTextContent());
    });
  }, []);

  const handleSubmit = useCallback(
    (submittedText: string) => {
      if (disabled) return;

      // Check for slash command
      const parsed = parseSlashCommand(submittedText);
      if (parsed) {
        onSlashCommand?.(parsed.command, parsed.args);
        return;
      }

      onSubmit(submittedText);
    },
    [disabled, onSlashCommand, onSubmit]
  );

  const handleButtonClick = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    handleSubmit(trimmed);
    editor.dispatchCommand(CLEAR_EDITOR_COMMAND, undefined);
  }, [text, disabled, handleSubmit, editor]);

  const hasContent = text.trim().length > 0;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            className={cn(
              "min-h-[76px] max-h-[240px] overflow-y-auto outline-none pl-3 pr-12 py-3",
              "text-primary text-sm",
              disabled && "cursor-not-allowed opacity-60"
            )}
            aria-disabled={disabled}
          />
        }
        placeholder={
          <div className="absolute top-3 left-3 text-muted-foreground pointer-events-none text-sm">
            {placeholder}
          </div>
        }
        ErrorBoundary={LexicalErrorBoundary}
      />

      {/* Submit button */}
      <div className="absolute right-2 bottom-1.5">
        <Button
          type="button"
          size="icon"
          className="rounded-full size-8"
          disabled={disabled || !hasContent}
          onClick={handleButtonClick}
        >
          <ArrowUp className="size-4" />
        </Button>
      </div>

      <AutoFocusPlugin />
      <ListPlugin />
      <ListShortcutPlugin />
      <HistoryPlugin />
      <ClearEditorPlugin />
      <OnChangePlugin onChange={handleChange} />
      <SubmitPlugin
        onSubmit={handleSubmit}
        disabled={disabled || isSlashMenuOpen}
      />
      <SlashCommandPlugin
        containerRef={containerRef}
        onMenuOpenChange={setIsSlashMenuOpen}
      />
    </div>
  );
}

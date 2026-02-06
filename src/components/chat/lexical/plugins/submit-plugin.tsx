import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  COMMAND_PRIORITY_LOW,
  KEY_ENTER_COMMAND,
  $getRoot,
  CLEAR_EDITOR_COMMAND,
} from "lexical";
import { useEffect } from "react";

type SubmitPluginProps = {
  onSubmit: (text: string) => void;
  disabled?: boolean;
};

export function SubmitPlugin({ onSubmit, disabled }: SubmitPluginProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event: KeyboardEvent | null) => {
          if (disabled) return false;

          // Shift+Enter creates new line
          if (event?.shiftKey) return false;

          const text = editor
            .getEditorState()
            .read(() => $getRoot().getTextContent().trim());

          if (!text) return true;

          event?.preventDefault();
          onSubmit(text);

          editor.dispatchCommand(CLEAR_EDITOR_COMMAND, undefined);

          return true;
        },
        COMMAND_PRIORITY_LOW
      ),
    [editor, onSubmit, disabled]
  );

  return null;
}

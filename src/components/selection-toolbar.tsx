import {
  DownloadIcon,
  CheckIcon,
  TrashIcon,
  UndoIcon,
  XIcon,
} from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";

import { Button } from "@/components/ui/button";
import { HotkeyButton } from "@/components/ui/hotkey-button";

interface SelectionToolbarProps {
  selectedCount: number;
  onExport: () => void;
  onComplete?: () => void;
  onDelete: () => void;
  onClear: () => void;
  showComplete?: boolean;
  isCompleted?: boolean;
  isTrash?: boolean;
}

export function SelectionToolbar({
  selectedCount,
  onExport,
  onComplete,
  onDelete,
  onClear,
  showComplete = true,
  isCompleted = false,
  isTrash = false,
}: SelectionToolbarProps) {
  // Escape to clear selection
  useHotkeys(
    "escape",
    () => {
      onClear();
    },
    { enabled: selectedCount > 0, preventDefault: true }
  );

  // Cmd+E to export
  useHotkeys(
    "meta+e",
    () => {
      onExport();
    },
    { enabled: selectedCount > 0, preventDefault: true }
  );

  // Cmd+Enter to complete/uncomplete
  useHotkeys(
    "meta+enter",
    () => {
      if (showComplete && onComplete) {
        onComplete();
      }
    },
    {
      enabled: selectedCount > 0 && showComplete && !!onComplete,
      preventDefault: true,
    }
  );

  // Cmd+Backspace to delete/restore
  useHotkeys(
    "meta+backspace",
    () => {
      onDelete();
    },
    { enabled: selectedCount > 0, preventDefault: true }
  );

  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-200">
      <div className="dark flex items-center gap-2 bg-popover text-popover-foreground border rounded-lg shadow-lg px-4 py-2">
        <span className="text-sm text-muted-foreground mr-2">
          {selectedCount} selected
        </span>

        <HotkeyButton
          variant="outline"
          size="sm"
          hotkey="meta+e"
          hotkeyEnabled={false}
          onClick={onExport}
        >
          <DownloadIcon className="h-4 w-4 mr-1" />
          Export
        </HotkeyButton>

        {showComplete && onComplete && (
          <HotkeyButton
            variant="outline"
            size="sm"
            hotkey="meta+enter"
            hotkeyEnabled={false}
            onClick={onComplete}
          >
            <CheckIcon className="h-4 w-4 mr-1" />
            {isCompleted ? "Uncomplete" : "Complete"}
          </HotkeyButton>
        )}

        <HotkeyButton
          variant="outline"
          size="sm"
          hotkey="meta+backspace"
          hotkeyEnabled={false}
          onClick={onDelete}
        >
          {isTrash ? (
            <>
              <UndoIcon className="h-4 w-4 mr-1" />
              Restore
            </>
          ) : (
            <>
              <TrashIcon className="h-4 w-4 mr-1" />
              Delete
            </>
          )}
        </HotkeyButton>

        <Button variant="ghost" size="sm" onClick={onClear} className="ml-2">
          <XIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

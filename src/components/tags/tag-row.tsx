import { Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { getTagColor, tagColorStyles } from "@/lib/tag-colors";
import { cn } from "@/lib/utils";

interface TagRowProps {
  tag: { id: string; name: string };
  count: number;
  onRename: (newName: string) => void;
  onDelete: () => void;
}

export function TagRow({ tag, count, onRename, onDelete }: TagRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(tag.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(tag.name);
  }, [tag.name]);

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== tag.name) {
      onRename(trimmed);
    } else {
      setEditValue(tag.name);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(tag.name);
    setIsEditing(false);
  };

  const color = getTagColor(tag.name);
  const styles = tagColorStyles[color];

  return (
    <div className="flex items-center gap-2 rounded px-2 py-1.5">
      {isEditing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSave();
            } else if (e.key === "Escape") {
              handleCancel();
            }
          }}
          className="h-6 flex-1 border border-input bg-transparent px-1.5 text-xs outline-none focus:border-ring"
        />
      ) : (
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className={cn(
            "inline-flex items-center px-1.5 py-0.5 text-xs font-medium transition-colors",
            styles.badge,
            styles.badgeHover,
            "cursor-pointer"
          )}
        >
          #{tag.name}
        </button>
      )}

      <span className="text-muted-foreground ml-auto text-xs tabular-nums">
        {count} {count === 1 ? "link" : "links"}
      </span>

      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground hover:text-destructive size-6"
        onClick={onDelete}
      >
        <Trash2Icon className="size-3.5" />
        <span className="sr-only">Delete {tag.name}</span>
      </Button>
    </div>
  );
}

import { Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  isValidTagName,
  MAX_TAG_NAME_LENGTH,
  sanitizeTagName,
} from "@/lib/tags";

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
    const sanitized = sanitizeTagName(editValue);
    if (isValidTagName(sanitized) && sanitized !== tag.name) {
      onRename(sanitized);
    } else {
      setEditValue(tag.name);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(tag.name);
    setIsEditing(false);
  };

  return (
    <div className="group/row flex items-center gap-2 rounded-xl px-1.5 py-1.5 hover:bg-muted/50">
      {isEditing ? (
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          maxLength={MAX_TAG_NAME_LENGTH}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              handleSave();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              handleCancel();
            }
          }}
          className="flex-1"
        />
      ) : (
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="flex h-7 cursor-pointer items-center text-xs font-medium text-foreground underline-offset-4 decoration-dotted decoration-muted-foreground group-hover/row:underline"
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
        onClick={onDelete}
        aria-label={`Delete ${tag.name}`}
        className="text-muted-foreground group-hover/row:text-destructive group-hover/row:hover:bg-destructive/10"
      >
        <Trash2Icon />
      </Button>
    </div>
  );
}

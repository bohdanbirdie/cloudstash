import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface TagBadgeProps {
  name: string;
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
}

export function TagBadge({
  name,
  onClick,
  onRemove,
  className,
}: TagBadgeProps) {
  const sharedClassName = cn(
    "inline-flex items-center gap-1 text-xs font-medium text-muted-foreground whitespace-nowrap transition-colors",
    onClick && "cursor-pointer hover:text-foreground",
    className
  );

  const removeIcon = onRemove && (
    <XIcon
      className="h-3 w-3 opacity-60 hover:opacity-100"
      aria-label={`Remove ${name} tag`}
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
    />
  );

  if (!onClick) {
    return (
      <span className={sharedClassName}>
        #{name}
        {removeIcon}
      </span>
    );
  }

  return (
    <button type="button" className={sharedClassName} onClick={onClick}>
      #{name}
      {removeIcon}
    </button>
  );
}

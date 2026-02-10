import { XIcon } from "lucide-react";

import { getTagColor, tagColorStyles } from "@/lib/tag-colors";
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
  const color = getTagColor(name);
  const styles = tagColorStyles[color];

  const badge = (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium transition-colors",
        styles.badge,
        onClick && styles.badgeHover,
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      #{name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="opacity-60 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current"
          aria-label={`Remove ${name} tag`}
        >
          <XIcon className="h-3 w-3" />
        </button>
      )}
    </span>
  );

  return badge;
}

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

  const sharedClassName = cn(
    "inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium transition-colors",
    styles.badge,
    onClick && styles.badgeHover,
    onClick && "cursor-pointer",
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

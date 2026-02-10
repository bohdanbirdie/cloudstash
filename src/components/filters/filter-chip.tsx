import { XIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface FilterChipProps {
  children: React.ReactNode;
  onRemove: () => void;
  className?: string;
  ariaLabel?: string;
}

export function FilterChip({
  children,
  onRemove,
  className,
  ariaLabel,
}: FilterChipProps) {
  return (
    <Badge variant="secondary" className={cn("gap-1 pr-1", className)}>
      {children}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-sm opacity-60 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current"
        aria-label={ariaLabel ?? "Remove filter"}
      >
        <XIcon className="h-3 w-3" />
      </button>
    </Badge>
  );
}

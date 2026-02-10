import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FilterBarProps {
  dropdowns: React.ReactNode;
  chips: React.ReactNode;
  totalCount: number;
  filteredCount: number;
  hasFilters: boolean;
  onClearAll: () => void;
  className?: string;
}

export function FilterBar({
  dropdowns,
  chips,
  totalCount,
  filteredCount,
  hasFilters,
  onClearAll,
  className,
}: FilterBarProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex items-center gap-2">{dropdowns}</div>

      {hasFilters && (
        <>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1.5 flex-wrap">{chips}</div>
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        {hasFilters && (
          <>
            <span className="text-sm text-muted-foreground">
              {filteredCount} of {totalCount}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAll}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              aria-label="Clear all filters"
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

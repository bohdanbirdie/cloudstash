import { SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface SearchTriggerButtonProps {
  active: boolean;
  onActivate: () => void;
}

// Mobile dock-row search trigger: a button styled like the desktop search pill.
// The real input lives inside the mobile sheet, so this never holds focus.
export function SearchTriggerButton({
  active,
  onActivate,
}: SearchTriggerButtonProps) {
  return (
    <button
      type="button"
      onClick={onActivate}
      aria-label="Search links"
      className={cn(
        "relative flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-full border bg-background px-4 text-left shadow-sm transition-colors",
        active ? "border-primary/40" : "border-border"
      )}
    >
      <SearchIcon
        className="size-4 shrink-0 text-muted-foreground"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <span className="flex-1 text-sm text-muted-foreground">Search links</span>
    </button>
  );
}

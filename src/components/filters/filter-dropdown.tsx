import { ChevronDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface FilterDropdownProps {
  label: string;
  icon?: React.ReactNode;
  hasActiveFilters?: boolean;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}

export function FilterDropdown({
  label,
  icon,
  hasActiveFilters,
  children,
  align = "start",
  className,
}: FilterDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 gap-1.5 text-sm",
              hasActiveFilters && "border-primary/50 bg-primary/5",
              className
            )}
          >
            {icon}
            {label}
            <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align={align} className="w-56">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export {
  DropdownMenuCheckboxItem as FilterDropdownCheckboxItem,
  DropdownMenuSeparator as FilterDropdownSeparator,
};

import { CheckIcon } from "lucide-react";

import { CommandItem } from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface ItemRowProps {
  value: string;
  name: string;
  selected: boolean;
  onPrimary: () => void;
  onSecondary: () => void;
  checkboxAriaLabel: string;
  trailing?: React.ReactNode;
}

export function ItemRow({
  value,
  name,
  selected,
  onPrimary,
  onSecondary,
  checkboxAriaLabel,
  trailing,
}: ItemRowProps) {
  return (
    <CommandItem value={value} onSelect={onSecondary}>
      <button
        type="button"
        aria-pressed={selected}
        aria-label={checkboxAriaLabel}
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onSecondary();
        }}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors",
          selected
            ? "border-primary bg-primary text-primary-foreground hover:bg-primary/80"
            : "border-border bg-background hover:border-primary/60"
        )}
      >
        {selected && <CheckIcon className="size-3" strokeWidth={2.5} />}
      </button>
      <button
        type="button"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onPrimary();
        }}
        className="flex-1 text-left font-medium"
      >
        #{name}
      </button>
      {trailing}
    </CommandItem>
  );
}

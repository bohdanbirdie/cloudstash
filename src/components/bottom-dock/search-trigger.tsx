import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon } from "lucide-react";
import type { RefObject } from "react";

import { Kbd } from "@/components/ui/kbd";
import { getHotkeyLabel } from "@/lib/hotkey-label";
import { cn } from "@/lib/utils";

interface SearchTriggerProps {
  inputRef: RefObject<HTMLInputElement | null>;
  active: boolean;
  value: string;
  onValueChange: (value: string) => void;
  onActivate: () => void;
}

export function SearchTrigger({
  inputRef,
  active,
  value,
  onValueChange,
  onActivate,
}: SearchTriggerProps) {
  return (
    <label
      role="search"
      className={cn(
        "flex h-10 w-[480px] items-center gap-2.5 rounded-full border bg-background px-4 shadow-sm transition-colors",
        active ? "border-primary/40" : "border-border"
      )}
    >
      <SearchIcon
        className="size-4 shrink-0 text-muted-foreground"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <CommandPrimitive.Input
        ref={inputRef}
        value={value}
        onValueChange={onValueChange}
        onFocus={onActivate}
        aria-label="Search links"
        placeholder="Search links"
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <Kbd aria-hidden="true">{getHotkeyLabel("meta+k")}</Kbd>
    </label>
  );
}

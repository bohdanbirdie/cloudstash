import { Loader2Icon } from "lucide-react";
import { useState, useEffect } from "react";

import { cn } from "@/lib/utils";

interface ThinkingProps {
  isLoading: boolean;
  debounceMs?: number;
  className?: string;
}

export function Thinking({
  isLoading,
  debounceMs = 300,
  className,
}: ThinkingProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => {
        setShow(true);
      }, debounceMs);
      return () => clearTimeout(timer);
    } else {
      setShow(false);
    }
  }, [isLoading, debounceMs]);

  if (!show) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-muted-foreground text-sm",
        className
      )}
    >
      <Loader2Icon className="size-3 animate-spin" />
      Thinking...
    </div>
  );
}

import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { fmtDepth } from "./overview-format";

export function DeltaBadge({ delta }: { delta: number }) {
  const title = "Change vs the prior week";
  if (delta === 0) {
    return (
      <span
        title={title}
        className="font-mono text-xs text-muted-foreground tabular-nums"
      >
        ±0
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-0.5 font-mono text-xs font-medium tabular-nums",
        up ? "text-green-600 dark:text-green-500" : "text-destructive"
      )}
    >
      {up ? (
        <ArrowUpIcon className="h-3 w-3" />
      ) : (
        <ArrowDownIcon className="h-3 w-3" />
      )}
      {fmtDepth(Math.abs(delta))}
    </span>
  );
}

import { cn } from "@/lib/utils";

export function TargetChip({
  target,
  meets,
}: {
  target: number;
  meets: boolean;
}) {
  return (
    <span
      title={`Goal: ${target}%`}
      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums"
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          meets ? "bg-green-500" : "bg-amber-500"
        )}
      />
      {meets ? "on target" : `below ${target}%`}
    </span>
  );
}

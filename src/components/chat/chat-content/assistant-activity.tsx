import { TextShimmer } from "@/components/ui/text-shimmer";
import { cn } from "@/lib/utils";

export function AssistantActivity({
  active,
  label,
  debounceMs = 250,
  className,
}: {
  active: boolean;
  label: string;
  debounceMs?: number;
  className?: string;
}) {
  if (!active) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "min-h-6 text-sm leading-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150",
        className
      )}
      style={{
        animationDelay: `${debounceMs}ms`,
        animationFillMode: "backwards",
      }}
    >
      <TextShimmer duration={1.8}>{label}</TextShimmer>
    </div>
  );
}

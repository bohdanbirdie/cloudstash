import { CloudstashLogo } from "@/components/cloudstash-logo";
import { cn } from "@/lib/utils";

// The canonical logo + name combination — one size, one spacing, one type
// treatment everywhere. The mark and wordmark take the surrounding text
// color: black on light surfaces, white on inverse ones, never a tint.
// No hover motion; the lockup is a stable anchor, not an interaction toy.
export function BrandLockup({
  className,
  variant = "plain",
  wordmarkClassName,
}: {
  className?: string;
  variant?: "plain" | "branded";
  wordmarkClassName?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <CloudstashLogo
        className={cn("size-5", { "rounded-sm": variant === "branded" })}
        variant={variant}
        size={20}
      />
      <span
        className={cn(
          "text-[13px] font-medium tracking-[-0.005em]",
          wordmarkClassName
        )}
      >
        cloudstash
      </span>
    </span>
  );
}

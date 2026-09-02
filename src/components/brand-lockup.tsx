import { CloudstashLogo } from "@/components/cloudstash-logo";
import { cn } from "@/lib/utils";

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

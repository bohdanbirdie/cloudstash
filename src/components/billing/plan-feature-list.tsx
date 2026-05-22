import { CheckIcon } from "lucide-react";

export function PlanFeatureList({ features }: { features: readonly string[] }) {
  return (
    <ul className="space-y-2 text-sm">
      {features.map((feature) => (
        <li key={feature} className="flex items-baseline gap-2.5">
          <CheckIcon
            aria-hidden
            className="size-3.5 shrink-0 translate-y-[1px] text-muted-foreground/70"
          />
          <span className="text-pretty text-foreground/90">{feature}</span>
        </li>
      ))}
    </ul>
  );
}

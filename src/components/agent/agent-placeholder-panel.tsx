import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePaywall } from "@/stores/paywall-store";

interface AgentPlaceholderPanelProps {
  variant: "loading" | "promo";
}

export function AgentPlaceholderPanel({ variant }: AgentPlaceholderPanelProps) {
  if (variant === "loading") return <LoadingState />;
  return <PromoState />;
}

function LoadingState() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex h-full flex-col justify-between p-8"
    >
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-44 rounded-sm" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-3/4 rounded-sm" />
          <Skeleton className="h-4 w-1/2 rounded-sm" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-28 rounded-sm" />
        <Skeleton className="h-7 w-24 rounded-md" />
      </div>
    </div>
  );
}

function PromoState() {
  const openPaywall = usePaywall((s) => s.openPaywall);
  return (
    <div className="flex h-full flex-col justify-between p-8">
      <div className="flex flex-col gap-3">
        <h3 className="text-xl font-bold leading-tight text-foreground text-balance">
          Ask your library.
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Find things by what you remember, not just keywords.
        </p>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Available on Pro
        </span>
        <Button
          type="button"
          size="default"
          onClick={() =>
            openPaywall({
              highlightTier: "pro",
              reason: "AI Chat is a Pro feature.",
            })
          }
        >
          See plans
        </Button>
      </div>
    </div>
  );
}

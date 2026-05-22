import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { CheckIcon, Loader2Icon } from "lucide-react";

import { PlanFeatureList } from "@/components/billing/plan-feature-list";
import { Button } from "@/components/ui/button";
import { useOrgFeatures } from "@/hooks/use-org-features";
import { loadAuth } from "@/lib/auth";
import { PLAN_CHANGE_COPY } from "@/lib/billing-copy";
import type { PlanTier } from "@/lib/plan";
import { PLANS } from "@/lib/plan";
import { MICRO_LABEL } from "@/lib/typography";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/welcome")({
  beforeLoad: async () => {
    const auth = await loadAuth();
    if (!auth?.isAuthenticated) throw redirect({ to: "/login" });
  },
  head: () => ({
    meta: [
      { title: "Welcome — Cloudstash" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: WelcomePage,
});

function unlockedFeatures(tier: PlanTier): readonly string[] {
  if (tier === "pro") return [...PLANS.plus.features, ...PLANS.pro.features];
  if (tier === "plus") return PLANS.plus.features;
  return PLANS.free.features;
}

function WelcomePage() {
  const { tier, isLoading, isFallback } = useOrgFeatures();

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6">
      <div className="w-full max-w-md rounded-xl border border-border/80 bg-background p-8 shadow-sm">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
            <Loader2Icon className="size-5 animate-spin" aria-hidden />
            <span className="text-sm">Confirming your plan…</span>
          </div>
        ) : isFallback ? (
          <UnconfirmedNotice />
        ) : (
          <Confirmation tier={tier} />
        )}
      </div>
    </div>
  );
}

function UnconfirmedNotice() {
  return (
    <div className="flex flex-col gap-6 text-center">
      <div className="flex flex-col gap-1.5">
        <span className={cn(MICRO_LABEL, "text-muted-foreground")}>
          Almost there
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          You’re all set
        </h1>
        <p className="text-pretty text-sm text-muted-foreground">
          We couldn’t refresh your plan just now, but your change is saved — it
          updates in your library shortly.
        </p>
      </div>
      <Button render={<Link to="/inbox" />} className="w-full">
        Go to your library
      </Button>
    </div>
  );
}

function Confirmation({ tier }: { tier: PlanTier }) {
  const plan = PLANS[tier];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col items-center gap-4 text-center">
        <span
          className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"
          aria-hidden
        >
          <CheckIcon className="size-6" />
        </span>
        <div className="flex flex-col gap-1.5">
          <span className={cn(MICRO_LABEL, "text-muted-foreground")}>
            Plan updated
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            You’re on {plan.name}
          </h1>
          <p className="text-pretty text-sm text-muted-foreground">
            {plan.tagline}
          </p>
        </div>
      </header>

      <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
        <PlanFeatureList features={unlockedFeatures(tier)} />
      </div>

      <Button render={<Link to="/inbox" />} className="w-full">
        Go to your library
      </Button>

      <p className="text-pretty text-center text-xs text-muted-foreground">
        {PLAN_CHANGE_COPY.summary}
      </p>
    </div>
  );
}

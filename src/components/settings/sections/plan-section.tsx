import { ArrowRightIcon } from "lucide-react";

import { SectionEyebrow } from "@/components/right-pane/detail-view/section-eyebrow";
import { Button } from "@/components/ui/button";
import { changePlan } from "@/lib/billing";
import type { PlanInfo, PlanTier } from "@/lib/plan";
import { PLAN_LIST, PLAN_ORDER, PLANS } from "@/lib/plan";
import { cn } from "@/lib/utils";

const CURRENT_TIER: PlanTier = "free";

type TileAction = "current" | "upgrade" | "downgrade";

function tileAction(planId: PlanTier, current: PlanTier): TileAction {
  const a = PLAN_ORDER.indexOf(planId);
  const b = PLAN_ORDER.indexOf(current);
  if (a === b) return "current";
  return a > b ? "upgrade" : "downgrade";
}

export function PlanSection() {
  const currentPlan = PLANS[CURRENT_TIER];

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-1.5">
        <SectionEyebrow>Your plan</SectionEyebrow>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            {currentPlan.name}
          </h2>
          <span className="text-sm text-muted-foreground tabular-nums">
            ${currentPlan.price} {currentPlan.priceSuffix}
          </span>
        </div>
      </header>

      <div className="flex flex-col gap-3">
        {PLAN_LIST.map((plan) => (
          <PlanTile
            key={plan.id}
            plan={plan}
            action={tileAction(plan.id, CURRENT_TIER)}
          />
        ))}
      </div>
    </div>
  );
}

function PlanTile({ plan, action }: { plan: PlanInfo; action: TileAction }) {
  const cumulative =
    plan.id === "free"
      ? plan.features
      : [`Everything in ${previousTierName(plan.id)}`, ...plan.features];

  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-lg border p-5",
        plan.inverted
          ? "border-foreground/95 bg-foreground text-background shadow-[0_1px_0_oklch(0_0_0_/_0.06),0_18px_40px_-20px_oklch(0_0_0_/_0.35)]"
          : plan.highlighted
            ? "border-primary/60 bg-background ring-1 ring-primary/25 shadow-[0_1px_0_oklch(0.553_0.195_38.402_/_0.12),0_12px_28px_-16px_oklch(0.553_0.195_38.402_/_0.25)]"
            : "border-border/80 bg-background"
      )}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "text-[11px] font-semibold uppercase tracking-[0.08em]",
                plan.inverted ? "text-background/60" : "text-muted-foreground"
              )}
            >
              {plan.name}
            </span>
            {plan.badge && (
              <span
                className={cn(
                  "select-none rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]",
                  plan.inverted
                    ? "border border-background/25 text-background/85"
                    : "bg-primary text-primary-foreground"
                )}
              >
                {plan.badge}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span
              className={cn(
                "text-3xl font-bold tracking-tight tabular-nums",
                plan.inverted ? "text-background" : "text-foreground"
              )}
            >
              ${plan.price}
            </span>
            <span
              className={cn(
                "text-xs font-medium",
                plan.inverted ? "text-background/60" : "text-muted-foreground"
              )}
            >
              {plan.priceSuffix}
            </span>
          </div>
        </div>
        <TileCta plan={plan} action={action} />
      </header>

      <p
        className={cn(
          "text-pretty text-sm",
          plan.inverted ? "text-background/70" : "text-muted-foreground"
        )}
      >
        {plan.tagline}
      </p>

      <ul className="grid gap-2 text-sm">
        {cumulative.map((feature) => (
          <li key={feature} className="flex items-baseline gap-2.5">
            <Check inverted={plan.inverted} />
            <span
              className={cn(
                "text-pretty",
                plan.inverted ? "text-background/90" : "text-foreground/90"
              )}
            >
              {feature}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function TileCta({ plan, action }: { plan: PlanInfo; action: TileAction }) {
  if (action === "current") {
    return (
      <span
        className={cn(
          "select-none rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em]",
          plan.inverted
            ? "bg-background/15 text-background"
            : "bg-foreground/[0.06] text-muted-foreground"
        )}
      >
        Current
      </span>
    );
  }

  const isUpgrade = action === "upgrade";

  return (
    <Button
      type="button"
      size="sm"
      variant={isUpgrade ? "default" : "outline"}
      onClick={() => changePlan(plan.id)}
      className={cn(
        "shrink-0",
        plan.inverted &&
          isUpgrade &&
          "bg-background text-foreground hover:bg-background/90",
        plan.inverted &&
          !isUpgrade &&
          "border-background/30 bg-transparent text-background hover:bg-background/10"
      )}
    >
      {isUpgrade ? "Upgrade" : "Downgrade"}
      {isUpgrade && <ArrowRightIcon className="size-3.5" />}
    </Button>
  );
}

function Check({ inverted }: { inverted?: boolean }) {
  return (
    <svg
      aria-hidden
      className={cn(
        "size-3.5 shrink-0 translate-y-[1px]",
        inverted ? "text-background" : "text-primary"
      )}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function previousTierName(tier: PlanTier): string {
  if (tier === "plus") return "Free";
  if (tier === "pro") return "Plus";
  return "";
}

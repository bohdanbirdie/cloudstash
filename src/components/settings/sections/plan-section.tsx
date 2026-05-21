import { ArrowRightIcon, CheckIcon } from "lucide-react";

import { SectionEyebrow } from "@/components/right-pane/detail-view/section-eyebrow";
import { Button } from "@/components/ui/button";
import { useOrgFeatures } from "@/hooks/use-org-features";
import { changePlan } from "@/lib/billing";
import type { PlanInfo, PlanTier } from "@/lib/plan";
import { PLAN_ORDER, PLANS } from "@/lib/plan";
import { MICRO_LABEL, MICRO_LABEL_SM } from "@/lib/typography";
import { cn } from "@/lib/utils";

type TileAction = "current" | "upgrade" | "downgrade";

function tileAction(planId: PlanTier, current: PlanTier): TileAction {
  const a = PLAN_ORDER.indexOf(planId);
  const b = PLAN_ORDER.indexOf(current);
  if (a === b) return "current";
  return a > b ? "upgrade" : "downgrade";
}

function dividerLabelFor(tier: PlanTier): string {
  if (tier === "free") return "or start with less";
  if (tier === "plus") return "your current plan";
  return "or step down";
}

function primaryFeatures(planId: PlanTier): readonly string[] {
  if (planId === "pro") return [...PLANS.plus.features, ...PLANS.pro.features];
  if (planId === "plus") return PLANS.plus.features;
  return PLANS.free.features;
}

export function PlanSection() {
  const { tier } = useOrgFeatures();
  const currentPlan = PLANS[tier];

  return (
    <div className="flex flex-col gap-6">
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

      <div className="flex flex-col gap-5">
        <PrimaryTile plan={PLANS.pro} action={tileAction("pro", tier)} />

        <Divider label={dividerLabelFor(tier)} />

        <SecondaryTile plan={PLANS.plus} action={tileAction("plus", tier)} />
      </div>

      {tier !== "free" && (
        <button
          type="button"
          onClick={() => changePlan("free")}
          className="self-end text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          downgrade to free
        </button>
      )}
    </div>
  );
}

function PrimaryTile({ plan, action }: { plan: PlanInfo; action: TileAction }) {
  const features = primaryFeatures(plan.id);

  return (
    <article className="flex flex-col gap-5 rounded-lg border border-border/80 bg-background p-5">
      <header className="flex flex-col gap-3">
        <div className="flex h-5 items-center gap-2">
          <span className={cn(MICRO_LABEL_SM, "text-muted-foreground")}>
            {plan.name}
          </span>
          {plan.badge && (
            <span className="select-none rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-primary">
              {plan.badge}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-x-1.5">
          <span className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
            ${plan.price}
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            {plan.priceSuffix}
          </span>
        </div>
        <p className="text-pretty text-sm text-muted-foreground">
          {plan.tagline}
        </p>
      </header>

      <FeatureColumns features={features} />

      <TileCta plan={plan} action={action} variant="primary" />
    </article>
  );
}

function SecondaryTile({
  plan,
  action,
}: {
  plan: PlanInfo;
  action: TileAction;
}) {
  return (
    <article className="ml-6 flex flex-col gap-3 rounded-lg border border-dashed border-border/70 bg-background/40 p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          <span className={cn(MICRO_LABEL_SM, "text-muted-foreground")}>
            {plan.name}
          </span>
          {plan.badge && (
            <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground/80">
              · {plan.badge}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-x-1">
          <span className="text-lg font-semibold text-foreground tabular-nums">
            ${plan.price}
          </span>
          <span className="text-xs text-muted-foreground">
            {plan.priceSuffix}
          </span>
        </div>
      </header>
      <p className="text-pretty text-sm text-muted-foreground">
        {plan.tagline}
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-foreground/75">
        {plan.features.map((feature) => (
          <span key={feature} className="inline-flex items-baseline gap-1">
            <span className="text-muted-foreground/70">+</span>
            <span>{feature}</span>
          </span>
        ))}
      </div>
      <TileCta plan={plan} action={action} variant="secondary" />
    </article>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="ml-6 flex items-center gap-3" aria-hidden>
      <span className={cn(MICRO_LABEL, "text-muted-foreground/80")}>
        {label}
      </span>
      <span className="h-px flex-1 bg-border/70" />
    </div>
  );
}

function TileCta({
  plan,
  action,
  variant,
}: {
  plan: PlanInfo;
  action: TileAction;
  variant: "primary" | "secondary";
}) {
  if (action === "current") {
    return (
      <div
        className={cn(
          MICRO_LABEL_SM,
          "select-none rounded-md bg-foreground/[0.06] text-center text-muted-foreground",
          variant === "secondary" ? "px-3 py-1.5" : "px-3 py-2"
        )}
      >
        Current plan
      </div>
    );
  }

  const isUpgrade = action === "upgrade";

  return (
    <Button
      type="button"
      variant={variant === "primary" && isUpgrade ? "default" : "outline"}
      size={variant === "secondary" ? "sm" : "default"}
      onClick={() => changePlan(plan.id)}
      className={cn("w-full", variant === "secondary" && "h-9")}
    >
      {isUpgrade ? `Upgrade to ${plan.name}` : `Downgrade to ${plan.name}`}
      {isUpgrade && <ArrowRightIcon className="size-3.5" />}
    </Button>
  );
}

function FeatureColumns({ features }: { features: readonly string[] }) {
  const mid = Math.floor(features.length / 2);
  const left = features.slice(0, mid);
  const right = features.slice(mid);
  return (
    <div className="grid gap-2 text-sm sm:grid-cols-2 sm:gap-x-5">
      <FeatureList items={left} />
      <FeatureList items={right} />
    </div>
  );
}

function FeatureList({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((feature) => (
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

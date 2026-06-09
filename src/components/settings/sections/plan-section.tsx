import { ArrowRightIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { IntervalToggle } from "@/components/billing/interval-toggle";
import { PlanFeatureList } from "@/components/billing/plan-feature-list";
import { SectionEyebrow } from "@/components/right-pane/detail-view/section-eyebrow";
import { Button } from "@/components/ui/button";
import { useOrgFeatures } from "@/hooks/use-org-features";
import { changePlan } from "@/lib/billing";
import {
  billingPeriodNote,
  cancelKeepsFeaturesCopy,
  formatRenewalDate,
  PLAN_CHANGE_COPY,
} from "@/lib/billing-copy";
import type { BillingInterval, PlanInfo, PlanTier } from "@/lib/plan";
import { PLAN_ORDER, planPriceDisplay, PLANS } from "@/lib/plan";
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

function changeNote(action: TileAction): string | null {
  if (action === "upgrade") return PLAN_CHANGE_COPY.upgrade;
  if (action === "downgrade") return PLAN_CHANGE_COPY.downgrade;
  return null;
}

export function PlanSection() {
  const { tier, cancelAtPeriodEnd, currentPeriodEnd, billingInterval } =
    useOrgFeatures();
  const currentPlan = PLANS[tier];
  const renewalDate = formatRenewalDate(currentPeriodEnd);
  const isCanceling = cancelAtPeriodEnd && tier !== "free";

  const [selectedInterval, setSelectedInterval] =
    useState<BillingInterval>("year");
  const activeInterval: BillingInterval =
    tier === "free" ? selectedInterval : (billingInterval ?? "month");
  const currentDisplay = planPriceDisplay(currentPlan, activeInterval);

  const [pending, setPending] = useState<PlanTier | null>(null);

  const handleChange = (target: PlanTier) => {
    if (pending !== null) return;
    setPending(target);
    void changePlan(target, tier, activeInterval).catch((err: unknown) => {
      setPending(null);
      toast.error("Couldn’t open billing", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <span role="status" aria-live="polite" className="sr-only">
        {pending ? "Opening billing…" : ""}
      </span>

      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex flex-col gap-1.5">
          <SectionEyebrow>Your plan</SectionEyebrow>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              {currentPlan.name}
            </h2>
            <span className="text-sm text-muted-foreground tabular-nums">
              ${currentDisplay.amount} {currentDisplay.suffix}
            </span>
          </div>
          {tier !== "free" && (
            <span className="text-xs text-muted-foreground">
              {billingPeriodNote(activeInterval)}
            </span>
          )}
        </div>

        {tier !== "free" && !isCanceling && (
          <div className="flex shrink-0 flex-col items-start gap-0.5">
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => handleChange("free")}
              disabled={pending !== null && pending !== "free"}
              aria-busy={pending === "free"}
              className="h-auto min-h-8 gap-1.5 p-0 text-sm font-normal text-muted-foreground hover:text-foreground"
            >
              {pending === "free" && (
                <Loader2Icon className="size-3 animate-spin" aria-hidden />
              )}
              Cancel subscription
            </Button>
            <span className="text-pretty text-xs text-muted-foreground">
              {PLAN_CHANGE_COPY.cancel}
            </span>
          </div>
        )}
      </header>

      {isCanceling && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg bg-muted/60 px-4 py-3.5">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-foreground tabular-nums">
              Ends {renewalDate ?? "at period end"}
            </span>
            <span className="text-pretty text-xs text-muted-foreground">
              {cancelKeepsFeaturesCopy(currentPlan.name)}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleChange(tier)}
            disabled={pending !== null && pending !== tier}
            aria-busy={pending === tier}
          >
            Resume {currentPlan.name}
            {pending === tier && (
              <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
            )}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {tier === "free" && (
          <IntervalToggle
            value={selectedInterval}
            onChange={setSelectedInterval}
          />
        )}

        <PrimaryTile
          plan={PLANS.pro}
          action={tileAction("pro", tier)}
          interval={activeInterval}
          pending={pending}
          onChange={handleChange}
        />

        <Divider label={dividerLabelFor(tier)} />

        <SecondaryTile
          plan={PLANS.plus}
          action={tileAction("plus", tier)}
          interval={activeInterval}
          pending={pending}
          onChange={handleChange}
        />
      </div>
    </div>
  );
}

function PrimaryTile({
  plan,
  action,
  interval,
  pending,
  onChange,
}: {
  plan: PlanInfo;
  action: TileAction;
  interval: BillingInterval;
  pending: PlanTier | null;
  onChange: (target: PlanTier) => void;
}) {
  const features = primaryFeatures(plan.id);
  const display = planPriceDisplay(plan, interval);

  return (
    <article className="flex flex-col gap-5 rounded-lg border border-border/80 bg-background p-5">
      <header className="flex flex-col gap-3">
        <div className="flex h-5 items-center gap-2">
          <span className={cn(MICRO_LABEL_SM, "text-muted-foreground")}>
            {plan.name}
          </span>
          {plan.badge && (
            <span
              className={cn(
                MICRO_LABEL,
                "select-none rounded-full bg-primary/10 px-2 py-0.5 text-primary"
              )}
            >
              {plan.badge}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-x-1.5">
          <span className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
            ${display.amount}
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            {display.suffix}
          </span>
        </div>
        <p className="text-pretty text-sm text-muted-foreground">
          {plan.tagline}
        </p>
      </header>

      <FeatureColumns features={features} />

      <TileCta
        plan={plan}
        action={action}
        variant="primary"
        pending={pending}
        onChange={onChange}
      />
    </article>
  );
}

function SecondaryTile({
  plan,
  action,
  interval,
  pending,
  onChange,
}: {
  plan: PlanInfo;
  action: TileAction;
  interval: BillingInterval;
  pending: PlanTier | null;
  onChange: (target: PlanTier) => void;
}) {
  const display = planPriceDisplay(plan, interval);
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
            ${display.amount}
          </span>
          <span className="text-xs text-muted-foreground">
            {display.suffix}
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
      <TileCta
        plan={plan}
        action={action}
        variant="secondary"
        pending={pending}
        onChange={onChange}
      />
    </article>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="ml-6 flex items-center gap-3">
      <span className={cn(MICRO_LABEL, "text-muted-foreground/80")}>
        {label}
      </span>
      <span className="h-px flex-1 bg-border/70" aria-hidden />
    </div>
  );
}

function TileCta({
  plan,
  action,
  variant,
  pending,
  onChange,
}: {
  plan: PlanInfo;
  action: TileAction;
  variant: "primary" | "secondary";
  pending: PlanTier | null;
  onChange: (target: PlanTier) => void;
}) {
  if (action === "current") {
    return (
      <div
        className={cn(
          MICRO_LABEL_SM,
          "select-none rounded-md bg-muted text-center text-muted-foreground",
          variant === "secondary" ? "px-3 py-1.5" : "px-3 py-2"
        )}
      >
        Current plan
      </div>
    );
  }

  const isUpgrade = action === "upgrade";
  const note = changeNote(action);
  const isPending = pending === plan.id;

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        variant={variant === "primary" && isUpgrade ? "default" : "outline"}
        size={variant === "secondary" ? "sm" : "default"}
        onClick={() => onChange(plan.id)}
        disabled={pending !== null && !isPending}
        aria-busy={isPending}
        className={cn("w-full", variant === "secondary" && "h-9")}
      >
        {isUpgrade ? `Upgrade to ${plan.name}` : `Downgrade to ${plan.name}`}
        {isPending ? (
          <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
        ) : (
          isUpgrade && <ArrowRightIcon className="size-3.5" aria-hidden />
        )}
      </Button>
      {note && (
        <p className="text-pretty text-center text-xs text-muted-foreground">
          {note}
        </p>
      )}
    </div>
  );
}

function FeatureColumns({ features }: { features: readonly string[] }) {
  const mid = Math.floor(features.length / 2);
  return (
    <div className="grid gap-2 sm:grid-cols-2 sm:gap-x-5">
      <PlanFeatureList features={features.slice(0, mid)} />
      <PlanFeatureList features={features.slice(mid)} />
    </div>
  );
}

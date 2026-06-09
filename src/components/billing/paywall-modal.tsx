import { CheckIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";

import { IntervalToggle } from "@/components/billing/interval-toggle";
import { PLAN_ICON } from "@/components/billing/plan-icon";
import { PlanPrice } from "@/components/billing/plan-price";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOrgFeatures } from "@/hooks/use-org-features";
import { changePlan } from "@/lib/billing";
import type { BillingInterval, PlanInfo, PlanTier } from "@/lib/plan";
import { PLAN_ORDER, PLANS, previousTierName } from "@/lib/plan";
import { cn } from "@/lib/utils";
import { usePaywall } from "@/stores/paywall-store";

type CardAction = "current" | "upgrade" | "included";

function cardAction(planId: PlanTier, current: PlanTier): CardAction {
  if (planId === current) return "current";
  return PLAN_ORDER.indexOf(planId) > PLAN_ORDER.indexOf(current)
    ? "upgrade"
    : "included";
}

export function PaywallModal() {
  const open = usePaywall((s) => s.open);
  const setOpen = usePaywall((s) => s.setOpen);
  const highlightTier = usePaywall((s) => s.highlightTier);
  const reason = usePaywall((s) => s.reason);
  const { tier, billingInterval } = useOrgFeatures();

  const [selectedInterval, setSelectedInterval] =
    useState<BillingInterval>("year");
  const activeInterval: BillingInterval =
    tier === "free" ? selectedInterval : (billingInterval ?? "month");

  const [pending, setPending] = useState<PlanTier | null>(null);

  const handleChange = (target: PlanTier) => {
    if (pending !== null) return;
    setPending(target);
    void changePlan(target, tier, activeInterval).catch(() => {
      setPending(null);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent fullScreenOnMobile className="gap-0 p-0 sm:max-w-3xl">
        <div className="flex max-h-[92svh] min-h-0 flex-col overflow-y-auto px-6 py-7 sm:px-8">
          <DialogHeader className="gap-2">
            <DialogTitle className="text-2xl font-bold tracking-tight text-balance text-foreground">
              Unlock the full Cloudstash
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {reason ??
                "AI on every save, your archive in chat, and every way to save."}
            </DialogDescription>
          </DialogHeader>

          {tier === "free" && (
            <div className="mt-6 flex justify-center">
              <IntervalToggle
                value={selectedInterval}
                onChange={setSelectedInterval}
              />
            </div>
          )}

          <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-stretch">
            <PaywallCard
              plan={PLANS.plus}
              action={cardAction("plus", tier)}
              currentTier={tier}
              interval={activeInterval}
              highlighted={highlightTier === "plus"}
              pending={pending}
              onChange={handleChange}
            />
            <PaywallCard
              plan={PLANS.pro}
              action={cardAction("pro", tier)}
              currentTier={tier}
              interval={activeInterval}
              highlighted={highlightTier === "pro"}
              pending={pending}
              onChange={handleChange}
            />
          </div>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            Cancel anytime — you keep your features until the end of the period.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PaywallCard({
  plan,
  action,
  currentTier,
  interval,
  highlighted,
  pending,
  onChange,
}: {
  plan: PlanInfo;
  action: CardAction;
  currentTier: PlanTier;
  interval: BillingInterval;
  highlighted: boolean;
  pending: PlanTier | null;
  onChange: (target: PlanTier) => void;
}) {
  const inverted = plan.inverted === true;
  const prevTier = previousTierName(plan.id);
  const features = plan.features;
  const Icon = PLAN_ICON[plan.id];

  return (
    <div
      className={cn("flex flex-1 flex-col rounded-xl border p-6", {
        "border-foreground/95 bg-foreground text-background": inverted,
        "border-border/80 bg-background": !inverted,
        "ring-2 ring-primary/40": highlighted && !inverted,
        "ring-2 ring-background/40": highlighted && inverted,
      })}
    >
      <div className="mb-4 flex h-6 items-center justify-between">
        <span
          className={cn(
            "flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.09em]",
            {
              "text-background/60": inverted,
              "text-muted-foreground": !inverted,
            }
          )}
        >
          {Icon && (
            <Icon
              className={cn("size-4", {
                "text-background": inverted,
                "text-primary": !inverted,
              })}
              aria-hidden
            />
          )}
          {plan.name}
        </span>
        {plan.badge && (
          <span
            className={cn(
              "select-none rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em]",
              {
                "border border-background/25 text-background/85": inverted,
                "bg-primary text-primary-foreground": !inverted,
              }
            )}
          >
            {plan.badge}
          </span>
        )}
      </div>

      <PlanPrice plan={plan} interval={interval} inverted={inverted} />

      <p
        className={cn("mt-4 mb-5 text-sm leading-relaxed text-pretty", {
          "text-background/70": inverted,
          "text-muted-foreground": !inverted,
        })}
      >
        {plan.tagline}
      </p>

      <div className="mb-6 flex flex-1 flex-col">
        {prevTier && (
          <p
            className={cn("mb-3 text-[13px] font-medium", {
              "text-background/60": inverted,
              "text-muted-foreground": !inverted,
            })}
          >
            Everything in {prevTier}, plus
          </p>
        )}
        <ul className="grid content-start gap-2.5 text-sm">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5">
              <CheckIcon
                className={cn("mt-0.5 size-4 shrink-0", {
                  "text-background": inverted,
                  "text-primary": !inverted,
                })}
                strokeWidth={2.5}
                aria-hidden
              />
              <span
                className={cn("leading-snug text-pretty", {
                  "text-background/90": inverted,
                  "text-foreground/90": !inverted,
                })}
              >
                {feature}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <CardCta
        plan={plan}
        action={action}
        currentTier={currentTier}
        inverted={inverted}
        pending={pending}
        onChange={onChange}
      />
    </div>
  );
}

function CardCta({
  plan,
  action,
  currentTier,
  inverted,
  pending,
  onChange,
}: {
  plan: PlanInfo;
  action: CardAction;
  currentTier: PlanTier;
  inverted: boolean;
  pending: PlanTier | null;
  onChange: (target: PlanTier) => void;
}) {
  if (action !== "upgrade") {
    return (
      <div
        className={cn(
          "select-none rounded-md py-2.5 text-center text-sm font-medium",
          {
            "bg-background/15 text-background/80": inverted,
            "bg-muted text-muted-foreground": !inverted,
          }
        )}
      >
        {action === "current" ? "Current plan" : "Included"}
      </div>
    );
  }

  const label =
    currentTier === "free"
      ? `Upgrade to ${plan.name}`
      : `Switch to ${plan.name}`;
  const isPending = pending === plan.id;

  return (
    <Button
      type="button"
      size="lg"
      onClick={() => onChange(plan.id)}
      disabled={pending !== null && !isPending}
      aria-busy={isPending}
      className={cn("h-11 w-full text-sm", {
        "bg-background text-foreground hover:bg-background/90": inverted,
      })}
    >
      {label}
      {isPending && (
        <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
      )}
    </Button>
  );
}

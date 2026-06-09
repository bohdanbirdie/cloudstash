import { Link } from "@tanstack/react-router";
import { CheckIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Transition } from "motion/react";
import { useState } from "react";

import { IntervalToggle } from "@/components/billing/interval-toggle";
import { PLAN_ICON } from "@/components/billing/plan-icon";
import { Button } from "@/components/ui/button";
import { RollingNumber } from "@/components/ui/rolling-number";
import type { BillingInterval, PlanInfo, PlanTier } from "@/lib/plan";
import {
  PLAN_LIST,
  planPriceDisplay,
  previousTierName,
  yearlySavings,
} from "@/lib/plan";
import { cn } from "@/lib/utils";

import { SectionHeader, SHELL } from "./shared";

const REVEAL: Transition = {
  type: "spring",
  duration: 0.3,
  bounce: 0,
};

const CTA_BY_TIER: Record<
  PlanTier,
  { label: string; upgrade?: "plus" | "pro" }
> = {
  free: { label: "Save your first link" },
  plus: { label: "Start Plus", upgrade: "plus" },
  pro: { label: "Start Pro", upgrade: "pro" },
};

export function Pricing() {
  const [interval, setInterval] = useState<BillingInterval>("year");

  return (
    <section
      id="pricing"
      className="border-y border-border/60 bg-muted/30 py-16 sm:py-20 lg:py-24"
    >
      <div className={SHELL}>
        <SectionHeader
          eyebrow="Pricing"
          title={
            <>
              Free to save. <span className="text-primary">Pay for power.</span>
            </>
          }
          lead="Saving links is free forever. Pay only when you want AI summaries and integrations."
        />

        <div className="mb-9 flex justify-center sm:mb-11">
          <IntervalToggle value={interval} onChange={setInterval} />
        </div>

        <div className="grid gap-5 sm:gap-6 lg:grid-cols-3 lg:items-stretch">
          {PLAN_LIST.map((plan, i) => (
            <PricingTile
              key={plan.id}
              plan={plan}
              index={i}
              interval={interval}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingTile({
  plan,
  index,
  interval,
}: {
  plan: PlanInfo;
  index: number;
  interval: BillingInterval;
}) {
  const cta = CTA_BY_TIER[plan.id];
  const Icon = PLAN_ICON[plan.id];
  const display = planPriceDisplay(plan, interval);
  const savings = yearlySavings(plan);
  const showSavings = interval === "year" && savings !== null;
  const savingsPct = savings?.pct ?? 0;
  const fullYearly = showSavings ? display.amount + (savings?.amount ?? 0) : 0;
  const prevTier = previousTierName(plan.id);
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={
        reduce
          ? undefined
          : {
              duration: 0.45,
              ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
              delay: index * 0.08,
            }
      }
      className={cn(
        "flex flex-col rounded-xl border p-7 transition-[border-color,box-shadow] sm:p-8",
        {
          "border-foreground/95 bg-foreground text-background shadow-[0_1px_0_oklch(0_0_0_/_0.06),0_24px_50px_-26px_oklch(0_0_0_/_0.45)]":
            plan.inverted,
          "border-primary/50 bg-background ring-1 ring-primary/30 shadow-[0_1px_0_oklch(from_var(--primary)_l_c_h_/_0.14),0_18px_40px_-22px_oklch(from_var(--primary)_l_c_h_/_0.32)]":
            !plan.inverted && plan.highlighted,
          "border-border/80 bg-background hover:border-border hover:shadow-[0_1px_0_oklch(0_0_0_/_0.04),0_10px_24px_-18px_oklch(0_0_0_/_0.2)]":
            !plan.inverted && !plan.highlighted,
        }
      )}
    >
      <div className="mb-6 flex h-6 items-center justify-between">
        <span
          className={cn(
            "flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.09em]",
            {
              "text-background/60": plan.inverted,
              "text-muted-foreground": !plan.inverted,
            }
          )}
        >
          {Icon && (
            <Icon
              className={cn("size-4", {
                "text-background": plan.inverted,
                "text-primary": !plan.inverted,
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
                "border border-background/25 text-background/85": plan.inverted,
                "bg-primary text-primary-foreground": !plan.inverted,
              }
            )}
          >
            {plan.badge}
          </span>
        )}
      </div>

      <PriceRow plan={plan} interval={interval} />

      <div className="mt-3 flex h-6 items-center gap-2">
        <AnimatePresence initial={false}>
          {showSavings ? (
            <motion.div
              key="savings"
              className="flex origin-left items-center gap-2"
              initial={
                reduce ? false : { opacity: 0, scale: 0.8, filter: "blur(4px)" }
              }
              animate={
                reduce
                  ? { opacity: 1 }
                  : { opacity: 1, scale: 1, filter: "blur(0px)" }
              }
              exit={
                reduce
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.8, filter: "blur(4px)" }
              }
              transition={reduce ? { duration: 0 } : REVEAL}
            >
              <s
                aria-hidden="true"
                className={cn("text-[13px] tabular-nums", {
                  "text-background/45": plan.inverted,
                  "text-muted-foreground/70": !plan.inverted,
                })}
              >
                ${fullYearly}
              </s>
              <span
                className={cn(
                  "select-none rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  {
                    "bg-primary text-primary-foreground": plan.inverted,
                    "bg-primary/10 text-primary": !plan.inverted,
                  }
                )}
              >
                Save {savingsPct}%
              </span>
              <span className="sr-only">
                {`$${fullYearly} per year if billed monthly`}
              </span>
            </motion.div>
          ) : plan.id === "free" ? (
            <span className="text-[13px] text-muted-foreground">
              No credit card required
            </span>
          ) : null}
        </AnimatePresence>
      </div>

      <p
        className={cn("mt-5 mb-7 text-pretty text-sm leading-relaxed", {
          "text-background/70": plan.inverted,
          "text-muted-foreground": !plan.inverted,
        })}
      >
        {plan.tagline}
      </p>

      <div className="mb-8 flex flex-1 flex-col">
        {prevTier && (
          <p
            className={cn("mb-3.5 text-[13px] font-medium", {
              "text-background/60": plan.inverted,
              "text-muted-foreground": !plan.inverted,
            })}
          >
            Everything in {prevTier}, plus
          </p>
        )}
        <ul className="grid content-start gap-3 text-sm">
          {plan.features.map((it) => (
            <li key={it} className="flex items-start gap-2.5">
              <CheckIcon
                className={cn("mt-0.5 size-4 shrink-0", {
                  "text-background": plan.inverted,
                  "text-primary": !plan.inverted,
                })}
                strokeWidth={2.5}
                aria-hidden
              />
              <span
                className={cn("text-pretty leading-snug", {
                  "text-background/90": plan.inverted,
                  "text-foreground/90": !plan.inverted,
                })}
              >
                {it}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <Button
        render={<Link to="/login" search={{ upgrade: cta.upgrade }} />}
        size="lg"
        variant={plan.id === "free" ? "outline" : "default"}
        className={cn("h-11 w-full px-6 text-sm", {
          "bg-background text-foreground shadow-[0_1px_0_oklch(0_0_0_/_0.08)] hover:bg-background/90":
            plan.inverted,
        })}
      >
        {cta.label}
      </Button>
    </motion.div>
  );
}

function PriceRow({
  plan,
  interval,
}: {
  plan: PlanInfo;
  interval: BillingInterval;
}) {
  const display = planPriceDisplay(plan, interval);
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className={cn(
          "flex items-baseline text-5xl font-bold leading-none tracking-tight tabular-nums",
          { "text-background": plan.inverted }
        )}
      >
        $
        <RollingNumber
          value={display.amount}
          direction={interval === "year" ? 1 : -1}
        />
      </span>
      <span
        className={cn("text-sm font-medium", {
          "text-background/55": plan.inverted,
          "text-muted-foreground": !plan.inverted,
        })}
      >
        {display.suffix}
      </span>
    </div>
  );
}

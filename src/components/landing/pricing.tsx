import { Link } from "@tanstack/react-router";
import { Match } from "effect";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { IntervalToggle } from "@/components/billing/interval-toggle";
import { Button } from "@/components/ui/button";
import type { BillingInterval, PlanInfo, PlanTier } from "@/lib/plan";
import { PLAN_LIST, planPriceDisplay, yearlySavings } from "@/lib/plan";
import { cn } from "@/lib/utils";

import { SectionHeader, SHELL } from "./shared";

const CTA_BY_TIER: Record<PlanTier, { label: string; href: string }> = {
  free: { label: "Save your first link", href: "/login" },
  plus: { label: "Start Plus", href: "/login" },
  pro: { label: "Start Pro", href: "/login" },
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
  const display = planPriceDisplay(plan, interval);
  const savings = yearlySavings(plan);
  const showSavings = interval === "year" && savings !== null;
  const savingsPct = savings?.pct ?? 0;
  const fullYearly = Match.value(showSavings).pipe(
    Match.when(true, () => display.amount + (savings?.amount ?? 0)),
    Match.orElse(() => 0)
  );
  const prevTier = previousTierName(plan.id);
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={Match.value(reduce).pipe(
        Match.when(true, () => false),
        Match.orElse(() => ({ opacity: 0, y: 16 }))
      )}
      whileInView={Match.value(reduce).pipe(
        Match.when(true, () => undefined),
        Match.orElse(() => ({ opacity: 1, y: 0 }))
      )}
      viewport={{ once: true, margin: "-60px" }}
      transition={Match.value(reduce).pipe(
        Match.when(true, () => undefined),
        Match.orElse(() => ({
          duration: 0.45,
          ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
          delay: index * 0.08,
        }))
      )}
      className={cn(
        "flex flex-col rounded-xl border p-7 transition-[border-color,box-shadow] sm:p-8",
        Match.value(plan).pipe(
          Match.when(
            { inverted: true },
            () =>
              "border-foreground/95 bg-foreground text-background shadow-[0_1px_0_oklch(0_0_0_/_0.06),0_24px_50px_-26px_oklch(0_0_0_/_0.45)]"
          ),
          Match.when(
            { highlighted: true },
            () =>
              "border-primary/50 bg-background ring-1 ring-primary/30 shadow-[0_1px_0_oklch(from_var(--primary)_l_c_h_/_0.14),0_18px_40px_-22px_oklch(from_var(--primary)_l_c_h_/_0.32)]"
          ),
          Match.orElse(
            () =>
              "border-border/80 bg-background hover:border-border hover:shadow-[0_1px_0_oklch(0_0_0_/_0.04),0_10px_24px_-18px_oklch(0_0_0_/_0.2)]"
          )
        )
      )}
    >
      <div className="mb-6 flex h-6 items-center justify-between">
        <span
          className={cn(
            "text-[12px] font-semibold uppercase tracking-[0.09em]",
            Match.value(plan.inverted).pipe(
              Match.when(true, () => "text-background/60"),
              Match.orElse(() => "text-muted-foreground")
            )
          )}
        >
          {plan.name}
        </span>
        {plan.badge && (
          <span
            className={cn(
              "select-none rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em]",
              Match.value(plan.inverted).pipe(
                Match.when(
                  true,
                  () => "border border-background/25 text-background/85"
                ),
                Match.orElse(() => "bg-primary text-primary-foreground")
              )
            )}
          >
            {plan.badge}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "text-5xl font-bold leading-none tracking-tight tabular-nums",
            plan.inverted && "text-background"
          )}
        >
          ${display.amount}
        </span>
        <span
          className={cn(
            "text-sm font-medium",
            Match.value(plan.inverted).pipe(
              Match.when(true, () => "text-background/55"),
              Match.orElse(() => "text-muted-foreground")
            )
          )}
        >
          {display.suffix}
        </span>
      </div>

      <div className="mt-3 flex h-6 items-center gap-2">
        {Match.value({ showSavings, isFree: plan.id === "free" }).pipe(
          Match.when({ showSavings: true }, () => (
            <>
              <s
                aria-hidden="true"
                className={cn(
                  "text-[13px] tabular-nums",
                  Match.value(plan.inverted).pipe(
                    Match.when(true, () => "text-background/45"),
                    Match.orElse(() => "text-muted-foreground/70")
                  )
                )}
              >
                ${fullYearly}
              </s>
              <span
                className={cn(
                  "select-none rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  Match.value(plan.inverted).pipe(
                    Match.when(
                      true,
                      () => "bg-primary text-primary-foreground"
                    ),
                    Match.orElse(() => "bg-primary/10 text-primary")
                  )
                )}
              >
                Save {savingsPct}%
              </span>
              <span className="sr-only">
                {`$${fullYearly} per year if billed monthly`}
              </span>
            </>
          )),
          Match.when({ isFree: true }, () => (
            <span className="text-[13px] text-muted-foreground">
              No credit card required
            </span>
          )),
          Match.orElse(() => null)
        )}
      </div>

      <p
        className={cn(
          "mt-5 mb-7 text-pretty text-sm leading-relaxed",
          Match.value(plan.inverted).pipe(
            Match.when(true, () => "text-background/70"),
            Match.orElse(() => "text-muted-foreground")
          )
        )}
      >
        {plan.tagline}
      </p>

      <div className="mb-8 flex flex-1 flex-col">
        {prevTier && (
          <p
            className={cn(
              "mb-3.5 text-[13px] font-medium",
              Match.value(plan.inverted).pipe(
                Match.when(true, () => "text-background/60"),
                Match.orElse(() => "text-muted-foreground")
              )
            )}
          >
            Everything in {prevTier}, plus
          </p>
        )}
        <ul className="grid content-start gap-3 text-sm">
          {plan.features.map((it) => (
            <li key={it} className="flex items-start gap-2.5">
              <span className="mt-0.5 inline-flex shrink-0">
                <PricingCheck inverted={plan.inverted} />
              </span>
              <span
                className={cn(
                  "text-pretty leading-snug",
                  Match.value(plan.inverted).pipe(
                    Match.when(true, () => "text-background/90"),
                    Match.orElse(() => "text-foreground/90")
                  )
                )}
              >
                {it}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <Button
        render={<Link to={cta.href} />}
        size="lg"
        variant={Match.value(plan.id).pipe(
          Match.when("free", () => "outline" as const),
          Match.orElse(() => "default" as const)
        )}
        className={cn(
          "h-11 w-full px-6 text-sm",
          plan.inverted &&
            "bg-background text-foreground shadow-[0_1px_0_oklch(0_0_0_/_0.08)] hover:bg-background/90"
        )}
      >
        {cta.label}
      </Button>
    </motion.div>
  );
}

function previousTierName(tier: PlanTier): string {
  if (tier === "plus") return "Free";
  if (tier === "pro") return "Plus";
  return "";
}

function PricingCheck({ inverted }: { inverted?: boolean }) {
  return (
    <svg
      className={cn(
        "size-4",
        Match.value(inverted).pipe(
          Match.when(true, () => "text-background"),
          Match.orElse(() => "text-primary")
        )
      )}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

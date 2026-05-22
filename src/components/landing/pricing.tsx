import { Link } from "@tanstack/react-router";
import { motion, useInView } from "motion/react";
import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { PlanInfo, PlanTier } from "@/lib/plan";
import { PLAN_LIST } from "@/lib/plan";
import { cn } from "@/lib/utils";

const CTA_BY_TIER: Record<PlanTier, { label: string; href: string }> = {
  free: { label: "Save your first link", href: "/login" },
  plus: { label: "Start Plus", href: "/login" },
  pro: { label: "Start Pro", href: "/login" },
};

import { SectionHeader, SHELL } from "./shared";

export function Pricing() {
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

        <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
          {PLAN_LIST.map((plan, i) => (
            <PricingTile key={plan.id} plan={plan} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingTile({ plan, index }: { plan: PlanInfo; index: number }) {
  const cta = CTA_BY_TIER[plan.id];
  const cumulative =
    plan.id === "free"
      ? plan.features
      : ["Everything in " + previousTierName(plan.id), ...plan.features];

  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  // When the page is reloaded already scrolled to Pricing, the tiles are on
  // screen at first paint — show them instantly instead of replaying the
  // slide-in, which otherwise reads as the section jumping on every refresh.
  const [onScreenAtMount, setOnScreenAtMount] = useState<boolean | null>(null);
  const measureRef = useCallback((node: HTMLDivElement | null) => {
    ref.current = node;
    if (node) {
      const r = node.getBoundingClientRect();
      setOnScreenAtMount(r.top < window.innerHeight && r.bottom > 0);
    }
  }, []);

  const instant = onScreenAtMount === true;
  const shown = instant || inView;

  return (
    <motion.div
      ref={measureRef}
      initial={false}
      animate={{ opacity: shown ? 1 : 0, y: shown ? 0 : 16 }}
      transition={
        instant
          ? { duration: 0 }
          : { duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: index * 0.08 }
      }
      className={cn(
        "flex flex-col rounded-lg border p-7 transition-[border-color,box-shadow]",
        plan.inverted
          ? "border-foreground/95 bg-foreground text-background shadow-[0_1px_0_oklch(0_0_0_/_0.06),0_18px_40px_-20px_oklch(0_0_0_/_0.35)]"
          : plan.highlighted
            ? "border-primary/60 bg-background ring-1 ring-primary/25 shadow-[0_1px_0_oklch(0.553_0.195_38.402_/_0.12),0_12px_28px_-16px_oklch(0.553_0.195_38.402_/_0.25)]"
            : "border-border/80 bg-background hover:border-border hover:shadow-[0_1px_0_oklch(0_0_0_/_0.04),0_8px_20px_-16px_oklch(0_0_0_/_0.18)]"
      )}
    >
      <div className="mb-5 flex items-center justify-between">
        <span
          className={cn(
            "text-[12px] font-semibold uppercase tracking-[0.08em]",
            plan.inverted ? "text-background/60" : "text-muted-foreground"
          )}
        >
          {plan.name}
        </span>
        {plan.badge && plan.highlighted && (
          <span className="select-none rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-primary-foreground">
            {plan.badge}
          </span>
        )}
        {plan.badge && plan.inverted && (
          <span className="select-none rounded-full border border-background/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-background/85">
            {plan.badge}
          </span>
        )}
      </div>
      <div className="mb-2 flex items-baseline gap-1.5">
        <span
          className={cn(
            "text-4xl font-bold tracking-tight tabular-nums",
            plan.inverted && "text-background"
          )}
        >
          ${plan.price}
        </span>
        <span
          className={cn(
            "text-sm font-medium",
            plan.inverted ? "text-background/60" : "text-muted-foreground"
          )}
        >
          {plan.priceSuffix}
        </span>
      </div>
      <p
        className={cn(
          "mb-7 text-pretty text-sm",
          plan.inverted ? "text-background/70" : "text-muted-foreground"
        )}
      >
        {plan.tagline}
      </p>
      <ul className="mb-8 grid flex-1 content-start gap-3 text-sm">
        {cumulative.map((it) => (
          <li key={it} className="flex items-baseline gap-2.5">
            <span className="inline-flex shrink-0">
              <PricingCheck inverted={plan.inverted} />
            </span>
            <span
              className={cn(
                "text-pretty",
                plan.inverted ? "text-background/90" : "text-foreground/90"
              )}
            >
              {it}
            </span>
          </li>
        ))}
      </ul>
      <Button
        render={<Link to={cta.href} />}
        size="lg"
        variant={plan.id === "free" ? "outline" : "default"}
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
      className={cn("size-4", inverted ? "text-background" : "text-primary")}
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

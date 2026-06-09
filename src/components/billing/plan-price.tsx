import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Transition } from "motion/react";

import { RollingNumber } from "@/components/ui/rolling-number";
import type { BillingInterval, PlanInfo } from "@/lib/plan";
import { planPriceDisplay, yearlySavings } from "@/lib/plan";
import { cn } from "@/lib/utils";

const REVEAL: Transition = {
  type: "spring",
  duration: 0.3,
  bounce: 0,
};

interface PlanPriceProps {
  plan: PlanInfo;
  interval: BillingInterval;
  inverted?: boolean;
  amountClassName?: string;
}

export function PlanPrice({
  plan,
  interval,
  inverted,
  amountClassName,
}: PlanPriceProps) {
  const display = planPriceDisplay(plan, interval);
  const savings = yearlySavings(plan);
  const showSavings = interval === "year" && savings !== null;
  const fullYearly = showSavings ? display.amount + savings.amount : 0;
  const reduce = useReducedMotion();

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "flex items-baseline text-4xl font-bold leading-none tracking-tight tabular-nums",
            { "text-background": inverted },
            amountClassName
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
            "text-background/55": inverted,
            "text-muted-foreground": !inverted,
          })}
        >
          {display.suffix}
        </span>
      </div>

      <div className="flex h-5 items-center gap-2">
        <AnimatePresence initial={false}>
          {showSavings && (
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
                aria-hidden
                className={cn("text-[13px] tabular-nums", {
                  "text-background/45": inverted,
                  "text-muted-foreground/70": !inverted,
                })}
              >
                ${fullYearly}
              </s>
              <span
                className={cn(
                  "select-none rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  {
                    "bg-primary text-primary-foreground": inverted,
                    "bg-primary/10 text-primary": !inverted,
                  }
                )}
              >
                Save {savings.pct}%
              </span>
              <span className="sr-only">
                {`$${fullYearly} per year if billed monthly`}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

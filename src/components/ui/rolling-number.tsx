import { AnimatePresence, motion } from "motion/react";
import type { Transition, Variants } from "motion/react";

import { cn } from "@/lib/utils";

const ROLL_VARIANTS: Variants = {
  enter: (direction: number) => ({
    y: direction > 0 ? "70%" : "-70%",
    opacity: 0,
    filter: "blur(4px)",
  }),
  center: { y: "0%", opacity: 1, filter: "blur(0px)" },
  exit: (direction: number) => ({
    y: direction > 0 ? "-70%" : "70%",
    opacity: 0,
    filter: "blur(4px)",
  }),
};

const ROLL_TRANSITION: Transition = {
  type: "spring",
  duration: 0.4,
  bounce: 0,
};

export function RollingNumber({
  value,
  direction,
  className,
}: {
  value: string | number;
  direction: number;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-block tabular-nums", className)}>
      <AnimatePresence custom={direction} initial={false} mode="popLayout">
        <motion.span
          key={value}
          custom={direction}
          className="inline-block"
          variants={ROLL_VARIANTS}
          initial="enter"
          animate="center"
          exit="exit"
          transition={ROLL_TRANSITION}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

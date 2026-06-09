import { MotionConfig, motion, useReducedMotion } from "motion/react";
import { useReducedMotion as useRM } from "framer-motion";

import { useReducedMotion as somethingElse } from "@/lib/not-motion";

// Violation: useReducedMotion imported from motion/react.
export function FromMotion() {
  const reduce = useReducedMotion();
  return <motion.div animate={reduce ? { opacity: 1 } : { scale: 1 }} />;
}

// Violation: useReducedMotion imported from framer-motion (aliased).
export function FromFramer() {
  const reduce = useRM();
  return <motion.div animate={reduce ? { opacity: 1 } : { scale: 1 }} />;
}

// Allowed: the global config is the sanctioned way to honor reduced motion.
export function Good() {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div animate={{ scale: 1 }} />
    </MotionConfig>
  );
}

// Allowed: a same-named import from somewhere that isn't a motion library.
export function NotMotion() {
  return somethingElse();
}

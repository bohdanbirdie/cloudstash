import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

export function IconSwap({
  iconKey,
  children,
}: {
  iconKey: string;
  children: ReactNode;
}) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={iconKey}
        initial={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
        transition={{ type: "spring", duration: 0.3, bounce: 0 }}
        className="inline-flex"
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}

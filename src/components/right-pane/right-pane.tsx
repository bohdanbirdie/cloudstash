import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

import { PerfProfiler } from "@/components/perf-hud";
import { useRightPane } from "@/components/right-pane-context";
import { DetailView } from "@/components/right-pane/detail-view";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WeeklyDigest } from "@/components/weekly-digest";

export function RightPane() {
  const { activeLinkId } = useRightPane();
  const reducedMotion = useReducedMotion();

  const mode = activeLinkId ? "detail" : "home";
  const prevMode = usePrevious(mode);
  const isReverse = mode === "home" && prevMode === "detail";

  const initial = reducedMotion
    ? { opacity: 0 }
    : isReverse
      ? { opacity: 0, x: -4, filter: "blur(0px)" }
      : { opacity: 0, x: -16, filter: "blur(4px)" };

  const animate = reducedMotion
    ? { opacity: 1 }
    : { opacity: 1, x: 0, filter: "blur(0px)" };

  const exit = reducedMotion
    ? { opacity: 0, transition: { duration: 0.1 } }
    : isReverse
      ? {
          opacity: 0,
          x: 6,
          filter: "blur(0px)",
          transition: { duration: 0.08 },
        }
      : {
          opacity: 0,
          x: -6,
          filter: "blur(0px)",
          transition: { duration: 0.08 },
        };

  const transition = reducedMotion
    ? { duration: 0.1 }
    : { type: "spring" as const, duration: 0.22, bounce: 0 };

  return (
    <aside
      aria-label={activeLinkId ? "Link details" : "This week's digest"}
      className="sticky top-0 h-svh self-start"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={mode}
          initial={initial}
          animate={animate}
          exit={exit}
          transition={transition}
          className="h-full"
        >
          {activeLinkId ? (
            <ScrollArea className="h-full">
              <PerfProfiler id="DetailView">
                <DetailView linkId={activeLinkId} />
              </PerfProfiler>
            </ScrollArea>
          ) : (
            <WeeklyDigest />
          )}
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}

function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

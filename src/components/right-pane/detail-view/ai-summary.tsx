import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { memo, useEffect, useRef, useState } from "react";

import { DotmSquare11 } from "@/components/ui/dotm-square-11";
import { Markdown } from "@/components/ui/markdown";
import { TextLoop } from "@/components/ui/text-loop";

import { SectionEyebrow } from "./section-eyebrow";

const SUMMARY_PROSE_CLASS =
  "text-sm leading-relaxed text-pretty [&>:first-child]:mt-0 [&>:last-child]:mb-0";

const INITIAL_PHRASES = [
  "Reading the page…",
  "Skimming the highlights…",
  "Distilling the gist…",
  "Drafting a summary…",
  "Almost there…",
] as const;

const REPROCESS_PHRASES = [
  "Re-reading…",
  "Reconsidering…",
  "Refining the summary…",
  "Polishing…",
] as const;

export const DetailSummary = memo(function DetailSummary({
  summary,
  isProcessing,
  isReprocessing,
  isFailed,
}: {
  summary: string | null;
  isProcessing: boolean;
  isReprocessing: boolean;
  isFailed: boolean;
}) {
  const isWorking = isProcessing || isReprocessing;

  if (!summary && !isWorking && !isFailed) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <SectionEyebrow>AI Summary</SectionEyebrow>
        <AnimatePresence>
          {isWorking && (
            <motion.div
              key="summary-loader"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="inline-flex"
            >
              <DotmSquare11
                size={14}
                dotSize={2}
                ariaLabel={
                  isReprocessing ? "Regenerating summary" : "Generating summary"
                }
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {summary ? (
        <SummaryBody summary={summary} />
      ) : isWorking ? (
        <RotatingPhrase
          key={isReprocessing ? "reprocess" : "initial"}
          phrases={isReprocessing ? REPROCESS_PHRASES : INITIAL_PHRASES}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          No summary for this one.
        </p>
      )}
    </div>
  );
});

function RotatingPhrase({
  phrases,
  intervalSeconds = 2.5,
}: {
  phrases: readonly string[];
  intervalSeconds?: number;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <TextLoop
      className="text-sm leading-relaxed text-muted-foreground"
      interval={intervalSeconds}
      trigger={!reduceMotion}
    >
      {phrases.map((phrase) => (
        <span key={phrase}>{phrase}</span>
      ))}
    </TextLoop>
  );
}

function SummaryBody({ summary }: { summary: string }) {
  const reduceMotion = useReducedMotion();
  const initialSummaryRef = useRef(summary);
  const [animationId, setAnimationId] = useState<number | null>(null);

  useEffect(() => {
    if (summary === initialSummaryRef.current) return;
    initialSummaryRef.current = summary;
    setAnimationId((id) => (id ?? 0) + 1);
  }, [summary]);

  if (animationId === null || reduceMotion) {
    return <Markdown className={SUMMARY_PROSE_CLASS}>{summary}</Markdown>;
  }

  return (
    <motion.div
      key={animationId}
      initial={{ filter: "blur(6px)", opacity: 0 }}
      animate={{ filter: "blur(0px)", opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <Markdown className={SUMMARY_PROSE_CLASS}>{summary}</Markdown>
    </motion.div>
  );
}

import { ArrowDownIcon, SearchIcon } from "lucide-react";
import { motion } from "motion/react";
import { Fragment } from "react";

import { Kbd } from "@/components/ui/kbd";
import { KeyChord } from "@/components/ui/key-chord";

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
const URL_TEXT = "nytimes.com/style/high-line-dawn";

type SummaryToken = string | { word: string; primary: true };

const SUMMARY_TOKENS: readonly SummaryToken[] = [
  "An",
  "essay",
  "on",
  "the",
  "city",
  "before",
  { word: "dawn", primary: true },
  "—",
  "joggers,",
  "deliveries,",
  "and",
  "the",
  "strange",
  "quiet",
  "of",
  "an",
  "elevated",
  "park",
  "most",
  "people",
  "miss.",
];

const T_URL = 0;
const T_KBD_PULSE = 0.45;
const T_URL_TEXT = 0.75;
const T_ARROW_1 = 1.8;
const T_CARD = 2.2;
const T_CARD_BODY = 2.5;
const T_SUMMARY = 2.8;
const WORD_STAGGER = 0.05;
const T_ARROW_2 = T_SUMMARY + SUMMARY_TOKENS.length * WORD_STAGGER + 0.4; // ~4.2
const T_SEARCH = T_ARROW_2 + 0.4;
const T_SEARCH_TEXT = T_SEARCH + 0.25;
const T_CARD_RING = T_SEARCH + 0.45;
const T_MATCH = T_SEARCH + 0.65;

const fadeUp = (delay: number, duration = 0.4) => ({
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration, ease: EASE_OUT, delay },
  },
});

const fadeDown = (delay: number) => ({
  hidden: { opacity: 0, y: -4 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: EASE_OUT, delay },
  },
});

const pulse = (delay: number) => ({
  hidden: { scale: 1 },
  visible: {
    scale: [1, 1.08, 1],
    transition: {
      duration: 0.4,
      ease: EASE_OUT,
      delay,
      times: [0, 0.45, 1],
    },
  },
});

const wipeIn = (delay: number) => ({
  hidden: { clipPath: "inset(0 100% 0 0)" },
  visible: {
    clipPath: "inset(0 0% 0 0)",
    transition: { duration: 0.55, ease: EASE_OUT, delay },
  },
});

const wordFade = (delay: number) => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.22, ease: EASE_OUT, delay },
  },
});

const ringPulse = (delay: number) => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: [0, 1, 0],
    transition: {
      duration: 0.9,
      ease: EASE_OUT,
      delay,
      times: [0, 0.35, 1],
    },
  },
});

export function PitchVisual() {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-60px" }}
      className="flex select-none flex-col items-stretch gap-3"
    >
      <motion.div
        variants={fadeUp(T_URL)}
        className="flex items-baseline gap-2.5 rounded-md border border-border/80 bg-background px-3 py-2.5"
      >
        <motion.div variants={pulse(T_KBD_PULSE)} className="inline-flex">
          <Kbd>
            <KeyChord keys={["cmd", "V"]} />
          </Kbd>
        </motion.div>
        <motion.span
          variants={wipeIn(T_URL_TEXT)}
          className="font-mono text-[12.5px] text-foreground/80"
        >
          {URL_TEXT}
        </motion.span>
      </motion.div>

      <motion.div
        variants={fadeDown(T_ARROW_1)}
        className="flex justify-center text-border"
      >
        <ArrowDownIcon className="size-4" aria-hidden="true" />
      </motion.div>

      <motion.div
        variants={fadeUp(T_CARD, 0.45)}
        className="relative rounded-md border border-border/80 bg-background p-4"
      >
        <motion.div
          variants={fadeUp(T_CARD_BODY)}
          className="flex items-start gap-2.5"
        >
          <span
            className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-[2px] font-serif text-[10px] font-bold text-white"
            style={{ backgroundColor: "#000" }}
            aria-hidden="true"
          >
            T
          </span>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold leading-snug">
              Walking the High Line at 6 AM
            </h4>
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">
                nytimes.com
              </span>
              <span className="whitespace-nowrap">
                <span className="text-muted-foreground/50">#</span>essay
              </span>
            </div>
          </div>
        </motion.div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {SUMMARY_TOKENS.map((tok, i) => {
            const isObj = typeof tok === "object";
            const word = isObj ? tok.word : tok;
            const isPrimary = isObj && tok.primary;
            return (
              <Fragment key={i}>
                {i > 0 && " "}
                <motion.span
                  variants={wordFade(T_SUMMARY + i * WORD_STAGGER)}
                  className={isPrimary ? "text-primary" : undefined}
                >
                  {word}
                </motion.span>
              </Fragment>
            );
          })}
        </p>
        <motion.div
          variants={ringPulse(T_CARD_RING)}
          aria-hidden="true"
          className="pointer-events-none absolute -inset-px rounded-md ring-2 ring-primary/50"
        />
      </motion.div>

      <motion.div
        variants={fadeDown(T_ARROW_2)}
        className="flex justify-center text-border"
      >
        <ArrowDownIcon className="size-4" aria-hidden="true" />
      </motion.div>

      <motion.div
        variants={fadeUp(T_SEARCH, 0.35)}
        className="flex items-center gap-2 rounded-md border border-border/80 bg-background px-3 py-2.5"
      >
        <SearchIcon
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <motion.span
          variants={wipeIn(T_SEARCH_TEXT)}
          className="font-mono text-[12.5px] text-foreground/80"
        >
          high line
        </motion.span>
        <motion.span
          variants={fadeUp(T_MATCH, 0.3)}
          className="ml-auto rounded-sm bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-primary"
        >
          1 match
        </motion.span>
      </motion.div>
    </motion.div>
  );
}

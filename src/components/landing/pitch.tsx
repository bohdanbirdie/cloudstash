import { motion } from "motion/react";

import { Kbd } from "@/components/ui/kbd";
import { KeyChord } from "@/components/ui/key-chord";

import { PitchVisual } from "./pitch-visual";
import { LandingEyebrow, SectionCta, SHELL } from "./shared";

const PITCH_STEPS: readonly {
  n: string;
  title: string;
  body: React.ReactNode;
  cue: React.ReactNode;
}[] = [
  {
    n: "01",
    title: "Save",
    cue: (
      <Kbd>
        <KeyChord keys={["cmd", "V"]} />
      </Kbd>
    ),
    body: (
      <>
        Paste a URL, forward a message, or hit{" "}
        <KeyChord keys={["cmd", "shift", "S"]} /> from Raycast.
      </>
    ),
  },
  {
    n: "02",
    title: "Summarize",
    cue: (
      <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.04em] text-primary">
        TL;DR
      </span>
    ),
    body: "A two-paragraph TL;DR is written before you’ve switched tabs.",
  },
  {
    n: "03",
    title: "Skim or search",
    cue: <Kbd>/</Kbd>,
    body: "Find any link by what it says, not what you remember.",
  },
];

export function Pitch() {
  return (
    <section
      id="how"
      className="border-y border-border/60 bg-muted/30 py-16 sm:py-20 lg:py-24"
    >
      <div className={SHELL}>
        <div className="grid gap-12 lg:grid-cols-[5fr_6fr] lg:items-start lg:gap-16">
          <div>
            <LandingEyebrow>How it works</LandingEyebrow>
            <h2 className="mt-2 text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              Paste a URL. <span className="text-primary">Done.</span>
            </h2>
            <p className="mt-4 max-w-[60ch] text-pretty text-sm leading-relaxed text-muted-foreground">
              Saved to a private archive, with a clean preview and a searchable
              summary — before you’ve switched apps.
            </p>
            <PitchSteps />
          </div>
          <PitchVisual />
        </div>
        <SectionCta />
      </div>
    </section>
  );
}

function PitchSteps() {
  return (
    <ol className="relative mt-8 grid gap-7">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-4 bottom-4 w-px -translate-x-1/2 bg-border/60"
      />
      {PITCH_STEPS.map((step, i) => (
        <motion.li
          key={step.n}
          initial={{ opacity: 0, x: -8 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{
            duration: 0.4,
            ease: [0.22, 1, 0.36, 1],
            delay: 0.2 + i * 0.18,
          }}
          className="grid grid-cols-[2rem_1fr] items-start gap-4"
        >
          <span
            aria-hidden="true"
            className="relative z-10 grid size-8 select-none place-items-center rounded-full border border-border/80 bg-background font-mono text-[10.5px] font-semibold tabular-nums text-primary"
          >
            {step.n}
          </span>
          <div>
            <div className="flex min-h-8 flex-wrap items-center gap-2">
              <span className="text-[15.5px] font-semibold leading-none tracking-tight">
                {step.title}
              </span>
              {step.cue}
            </div>
            <p className="mt-1.5 max-w-[44ch] text-pretty text-[13px] leading-relaxed text-muted-foreground">
              {step.body}
            </p>
          </div>
        </motion.li>
      ))}
    </ol>
  );
}

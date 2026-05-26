import { motion } from "motion/react";

import { SHELL } from "./shared";

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function PullQuote() {
  return (
    <section
      aria-label="Cloudstash in one line"
      className="relative overflow-hidden bg-primary py-20 text-primary-foreground sm:py-28"
    >
      <PullQuoteBackdrop />
      <div className={`relative ${SHELL}`}>
        <div className="grid items-center gap-14 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.55, ease: EASE_OUT }}
          >
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-primary-foreground/65">
              In one line
            </p>
            <h2 className="mt-5 text-pretty text-5xl font-bold leading-[1] tracking-[-0.02em] sm:text-6xl">
              Skim <span className="font-italic-accent">ten</span> before
              opening one.
            </h2>
            <p className="mt-6 max-w-[44ch] text-pretty text-[15px] leading-relaxed text-primary-foreground/85">
              A two-paragraph TL;DR on every save. Your inbox reads like a
              contents page — you only open what earns it.
            </p>
          </motion.div>

          <TldrStack />
        </div>
      </div>
    </section>
  );
}

const TLDR_ITEMS: readonly {
  source: string;
  domain: string;
  body: string;
}[] = [
  {
    source: "The Atlantic",
    domain: "theatlantic.com",
    body: "Why letter-writing came back — a slow, deliberate counterweight to the inbox.",
  },
  {
    source: "Serious Eats",
    domain: "seriouseats.com",
    body: "Salt the bird the night before. High oven, low patience. A 50-minute classic.",
  },
  {
    source: "arxiv",
    domain: "arxiv.org",
    body: "Attention beats recurrence — the Transformer paper that quietly reshaped the field.",
  },
];

function TldrStack() {
  return (
    <div className="grid gap-3">
      {TLDR_ITEMS.map((it, i) => (
        <motion.div
          key={it.source}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{
            duration: 0.45,
            ease: EASE_OUT,
            delay: 0.15 + i * 0.1,
          }}
          className="rounded-md border border-primary-foreground/[0.18] bg-primary-foreground/[0.08] p-4"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-foreground/75">
              TL;DR
            </span>
            <span className="font-mono text-[10.5px] text-primary-foreground/65">
              {it.domain}
            </span>
          </div>
          <p className="mt-2 text-pretty text-[13.5px] leading-snug text-primary-foreground">
            {it.body}
          </p>
        </motion.div>
      ))}
    </div>
  );
}

function PullQuoteBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div
        className="absolute -right-32 -top-40 h-[44rem] w-[44rem] rounded-full opacity-60 blur-[140px]"
        style={{ backgroundColor: "oklch(0.78 0.21 50 / 0.55)" }}
      />
      <div
        className="absolute -bottom-40 -left-40 h-[36rem] w-[36rem] rounded-full opacity-50 blur-[160px]"
        style={{ backgroundColor: "oklch(0.42 0.18 35 / 0.7)" }}
      />
    </div>
  );
}

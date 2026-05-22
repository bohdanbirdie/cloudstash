import { SearchIcon } from "lucide-react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function BenefitsGrid() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-10 lg:grid-cols-12">
      <FeatureBenefit
        delay={0}
        title="Search everything."
        body="Title, domain, summary, tag. Instant and offline — your whole archive is a keystroke away."
        className="sm:col-span-2 lg:col-span-6"
      >
        <SearchMockup />
      </FeatureBenefit>
      <SmallBenefit
        delay={0.08}
        title="AI that read it for you."
        body="Two-paragraph TL;DR on every save. Skim ten before opening one."
        visual={<TldrCard />}
        className="lg:col-span-3"
      />
      <SmallBenefit
        delay={0.16}
        title="Tags when you want."
        body="Tag what matters. Archive when done. Never required to file."
        visual={<TagsRow />}
        className="lg:col-span-3"
      />

      <FeatureBenefit
        delay={0.24}
        title="Chat with your archive."
        body="Ask a question. Answers cite the links you saved."
        className="sm:col-span-2 lg:col-span-6"
      >
        <ChatMockup />
      </FeatureBenefit>
      <SmallBenefit
        delay={0.32}
        title="Synced in real time."
        body="Save on your phone, see it on your laptop the same second. Works offline, too."
        visual={<SyncRow />}
        className="lg:col-span-3"
      />
      <SmallBenefit
        delay={0.4}
        title="Yours to keep."
        body="Export your whole archive anytime — links, summaries, tags. No lock-in."
        visual={<ArchiveCard />}
        className="lg:col-span-3"
      />
    </div>
  );
}

function FeatureBenefit({
  title,
  body,
  delay,
  className,
  children,
}: {
  title: string;
  body: string;
  delay: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.45, ease: EASE_OUT, delay }}
      className={cn(
        "flex flex-col gap-5 border-t border-border/60 pt-5",
        className
      )}
    >
      <div>
        <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
        <p className="mt-1.5 max-w-[42ch] text-pretty text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>
      </div>
      <div className="mt-auto">{children}</div>
    </motion.div>
  );
}

function SmallBenefit({
  title,
  body,
  delay,
  visual,
  className,
}: {
  title: string;
  body: string;
  delay: number;
  visual?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.45, ease: EASE_OUT, delay }}
      className={cn(
        "flex flex-col gap-4 border-t border-border/60 pt-5",
        className
      )}
    >
      <div>
        <h3 className="text-[1.0625rem] font-semibold leading-snug tracking-tight">
          {title}
        </h3>
        <p className="mt-1.5 text-pretty text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>
      </div>
      {visual && <div className="mt-auto">{visual}</div>}
    </motion.div>
  );
}

function TldrCard() {
  return (
    <div className="select-none rounded-md border border-border/60 bg-background p-2.5">
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 rounded-sm bg-primary/10 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold tracking-[0.04em] text-primary">
          TL;DR
        </span>
        <span className="text-pretty text-[11.5px] leading-relaxed text-muted-foreground">
          A weekend in Lisbon — small bars, blue tiles, custard tarts at 9 AM.
        </span>
      </div>
    </div>
  );
}

function TagsRow() {
  return (
    <div className="select-none rounded-md border border-border/60 bg-background p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <TagChip>read</TagChip>
        <TagChip>cook</TagChip>
        <TagChip primary>later</TagChip>
        <span className="font-mono text-[11px] text-muted-foreground/50">
          +
        </span>
      </div>
    </div>
  );
}

function TagChip({
  children,
  primary,
}: {
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <span
      className={cn(
        "rounded-sm px-1.5 py-0.5 font-mono text-[10.5px]",
        primary
          ? "bg-primary/10 text-primary"
          : "bg-muted/60 text-foreground/80"
      )}
    >
      <span
        className={primary ? "text-primary/60" : "text-muted-foreground/55"}
      >
        #
      </span>
      {children}
    </span>
  );
}

function SyncRow() {
  return (
    <div className="flex h-10 select-none items-center rounded-md border border-border/60 bg-background px-2.5">
      <div className="flex w-full items-center gap-2">
        <DeviceChip>macOS</DeviceChip>
        <DotsTrail baseDelay={0.4} />
        <DeviceChip>iOS</DeviceChip>
        <DotsTrail baseDelay={0.58} />
        <DeviceChip>Web</DeviceChip>
      </div>
    </div>
  );
}

function DeviceChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-sm bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-foreground/80">
      {children}
    </span>
  );
}

function DotsTrail({ baseDelay }: { baseDelay: number }) {
  return (
    <span className="flex flex-1 items-center justify-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0.18 }}
          whileInView={{ opacity: [0.18, 1, 0.4] }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{
            duration: 0.6,
            ease: EASE_OUT,
            delay: baseDelay + i * 0.08,
            times: [0, 0.5, 1],
          }}
          className="size-1 rounded-full bg-primary"
        />
      ))}
    </span>
  );
}

function ArchiveCard() {
  return (
    <div className="flex h-10 select-none items-center gap-2 rounded-md border border-border/60 bg-background px-2.5">
      <FileMark />
      <span className="font-mono text-[11.5px] text-foreground">
        archive.json
      </span>
      <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">
        1,247 links
      </span>
    </div>
  );
}

function FileMark() {
  return (
    <svg
      className="size-3.5 shrink-0 text-muted-foreground"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function SearchMockup() {
  const results = [
    {
      title: "The Best Cacio e Pepe (Trust Us)",
      meta: "seriouseats.com · #cook",
    },
    {
      title: "Marcella Hazan's Tomato Sauce",
      meta: "nytimes.com · #cook",
    },
    {
      title: "Why I gave up on perfectly al dente",
      meta: "thekitchn.com · #essay",
    },
  ];
  return (
    <div className="select-none rounded-md border border-border/60 bg-background p-3.5">
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.35 }}
        className="flex items-center gap-2 rounded-sm border border-border/60 bg-muted/50 px-2.5 py-1.5"
      >
        <SearchIcon
          className="size-3.5 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="text-[12px] text-foreground/80">pasta</span>
      </motion.div>
      <ul className="mt-3 grid gap-2.5">
        {results.map((r, i) => (
          <motion.li
            key={r.title}
            initial={{ opacity: 0, x: -4 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{
              duration: 0.3,
              ease: EASE_OUT,
              delay: 0.55 + i * 0.07,
            }}
          >
            <div className="text-[12.5px] font-medium leading-snug">
              {r.title}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {r.meta}
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function ChatMockup() {
  return (
    <div className="grid select-none gap-2.5">
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.35 }}
        className="ml-auto max-w-[78%] rounded-2xl rounded-br-[6px] bg-muted px-3 py-1.5 text-[12.5px] leading-snug"
      >
        What did I save about gardens?
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.7 }}
        className="max-w-[92%] rounded-2xl rounded-bl-[6px] border border-border/60 bg-background px-3 py-2.5 text-[12.5px] leading-relaxed"
      >
        <p>
          A New York Times piece on the Botanical Garden in the Bronx — gentle
          and easy to skim.
        </p>
        <motion.span
          initial={{ opacity: 0, y: 2 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.3, ease: EASE_OUT, delay: 1.0 }}
          className="mt-2 inline-flex items-center gap-1.5 rounded-sm border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10.5px] font-medium text-foreground/85"
        >
          <span
            className="grid size-2.5 shrink-0 place-items-center rounded-[2px] font-serif text-[7px] font-bold text-white"
            style={{ backgroundColor: "#000" }}
            aria-hidden="true"
          >
            T
          </span>
          <span>A walk through the New York Botanical Garden</span>
          <span className="text-muted-foreground/60">· nytimes.com</span>
        </motion.span>
      </motion.div>
    </div>
  );
}

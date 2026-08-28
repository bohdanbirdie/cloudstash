import { useState } from "react";

import { Favicon } from "@/components/favicon";
import { cn } from "@/lib/utils";

type DemoLink = {
  readonly id: string;
  readonly title: string;
  readonly domain: string;
  readonly tag: string;
  readonly favicon: string;
  readonly pattern: "nodes" | "waves" | "contours" | "grid" | "rings";
  readonly kind: string;
  readonly summary: string;
};

const DEMO_LINKS: readonly DemoLink[] = [
  {
    id: "attention",
    title: "Attention Is All You Need",
    domain: "arxiv.org",
    tag: "papers",
    favicon: "/favicons/arxiv.png",
    pattern: "nodes",
    kind: "Research note",
    summary:
      "The paper that introduced the Transformer: a simpler way for models to understand relationships across an entire sequence at once.",
  },
  {
    id: "city-noise",
    title: "Why Cities Are So Loud — A Video Essay",
    domain: "youtube.com",
    tag: "watch",
    favicon: "/favicons/youtube.png",
    pattern: "waves",
    kind: "Video essay",
    summary:
      "A tour through the design choices, traffic patterns, and public spaces that shape how a city sounds—and what quieter streets could feel like.",
  },
  {
    id: "botanical-garden",
    title: "A walk through the New York Botanical Garden",
    domain: "nytimes.com",
    tag: "travel",
    favicon: "/favicons/nytimes.png",
    pattern: "contours",
    kind: "Field note",
    summary:
      "A visual walk through seasonal gardens, quiet paths, and the collections worth seeking out on a slow afternoon in the Bronx.",
  },
  {
    id: "typescript",
    title: "microsoft/typescript: JavaScript with types",
    domain: "github.com",
    tag: "code",
    favicon: "/favicons/github.png",
    pattern: "grid",
    kind: "Repository",
    summary:
      "The TypeScript compiler, language services, and tooling live here alongside documentation for contributing to the project.",
  },
  {
    id: "roast-chicken",
    title: "The Best Roast Chicken (Seriously)",
    domain: "seriouseats.com",
    tag: "cook",
    favicon: "/favicons/seriouseats.png",
    pattern: "rings",
    kind: "Recipe",
    summary:
      "A practical method for crisp skin and evenly cooked meat, with the preparation choices that make the largest difference.",
  },
];

export function HeroInbox() {
  const [selectedId, setSelectedId] = useState(DEMO_LINKS[0]!.id);
  const selected =
    DEMO_LINKS.find((link) => link.id === selectedId) ?? DEMO_LINKS[0]!;

  return (
    <div className="overflow-hidden rounded-md border border-border/80 bg-background">
      <div className="grid md:h-[29rem] md:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
        <div className="border-b border-border/80 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="text-[13px] font-semibold">Inbox</div>
            <div className="text-xs tabular-nums text-muted-foreground">
              {DEMO_LINKS.length}
            </div>
          </div>
          <ul className="px-2 pb-2">
            {DEMO_LINKS.map((link, index) => (
              <li
                key={link.id}
                className={cn({ "hidden md:block": index > 2 })}
              >
                <DemoLinkRow
                  link={link}
                  selected={selected.id === link.id}
                  onSelect={() => setSelectedId(link.id)}
                />
              </li>
            ))}
          </ul>
        </div>
        <DemoLinkPreview link={selected} />
      </div>
    </div>
  );
}

function DemoLinkRow({
  link,
  selected,
  onSelect,
}: {
  link: DemoLink;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-md px-2.5 py-3 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40",
        { "bg-muted": selected }
      )}
    >
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-border/80 bg-background">
        <Favicon
          src={link.favicon}
          className="size-3.5 rounded-[2px] object-contain"
        />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium leading-snug">
          {link.title}
        </span>
        <span className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="truncate">{link.domain}</span>
          <span className="whitespace-nowrap">
            <span className="text-muted-foreground/50">#</span>
            {link.tag}
          </span>
        </span>
      </span>
    </button>
  );
}

function DemoLinkPreview({ link }: { link: DemoLink }) {
  return (
    <div className="flex min-h-80 flex-col p-4 sm:p-5 md:min-h-0">
      <DemoArtwork pattern={link.pattern} />

      <div className="mt-5 flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Favicon
            src={link.favicon}
            className="size-3 rounded-[2px] object-contain"
          />
          <span>{link.domain}</span>
          <span aria-hidden="true">·</span>
          <span>#{link.tag}</span>
          <span aria-hidden="true">·</span>
          <span>{link.kind}</span>
        </div>
        <div className="mt-2 text-pretty text-lg font-semibold leading-snug tracking-tight">
          {link.title}
        </div>
        <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
          AI summary
        </div>
        <p className="mt-2 text-pretty text-[13px] leading-relaxed text-muted-foreground">
          {link.summary}
        </p>
      </div>
    </div>
  );
}

function DemoArtwork({ pattern }: { pattern: DemoLink["pattern"] }) {
  return (
    <div
      aria-hidden="true"
      className="relative h-36 overflow-hidden rounded-md border border-border/80 bg-muted/30 sm:h-44"
    >
      <PreviewPattern pattern={pattern} />
    </div>
  );
}

function PreviewPattern({ pattern }: { pattern: DemoLink["pattern"] }) {
  switch (pattern) {
    case "nodes":
      return <NodesPattern />;
    case "waves":
      return <WavesPattern />;
    case "contours":
      return <ContoursPattern />;
    case "grid":
      return <GridPattern />;
    case "rings":
      return <RingsPattern />;
  }
}

const patternClassName = "absolute inset-0 size-full text-muted-foreground/20";

function NodesPattern() {
  return (
    <svg
      className={patternClassName}
      viewBox="0 0 480 128"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern
          id="preview-nodes"
          width="80"
          height="64"
          patternUnits="userSpaceOnUse"
        >
          <path d="M0 32 40 8l40 24-40 24Z" fill="none" stroke="currentColor" />
          <circle cx="0" cy="32" r="2.5" fill="currentColor" />
          <circle cx="40" cy="8" r="2.5" fill="currentColor" />
          <circle cx="40" cy="56" r="2.5" fill="currentColor" />
          <circle cx="80" cy="32" r="2.5" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#preview-nodes)" />
      <circle
        className="text-primary/35"
        cx="280"
        cy="72"
        r="4"
        fill="currentColor"
      />
    </svg>
  );
}

function WavesPattern() {
  return (
    <svg
      className={patternClassName}
      viewBox="0 0 480 128"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern
          id="preview-waves"
          width="120"
          height="32"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M0 16c20-18 40-18 60 0s40 18 60 0"
            fill="none"
            stroke="currentColor"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#preview-waves)" />
      <path
        className="text-primary/30"
        d="M120 80c20-18 40-18 60 0s40 18 60 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function ContoursPattern() {
  return (
    <svg
      className={patternClassName}
      viewBox="0 0 480 128"
      preserveAspectRatio="xMidYMid slice"
    >
      <g fill="none" stroke="currentColor">
        <path d="M-20 112C40 36 112 38 162 82s118 32 154-12 94-54 184-8" />
        <path d="M-20 92C42 24 116 30 170 68s112 26 150-12 94-48 180-8" />
        <path d="M-20 72C46 12 120 20 178 54s106 20 146-12 94-40 176-6" />
        <path d="M-20 52C50 0 126 10 186 40s102 14 142-12 94-32 172-4" />
      </g>
      <path
        className="text-primary/30"
        d="M-20 92C42 24 116 30 170 68s112 26 150-12 94-48 180-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function GridPattern() {
  return (
    <svg
      className={patternClassName}
      viewBox="0 0 480 128"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern
          id="preview-grid"
          width="28"
          height="28"
          patternUnits="userSpaceOnUse"
        >
          <path d="M28 0H0v28" fill="none" stroke="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#preview-grid)" />
      <rect
        className="text-primary/25"
        x="280"
        y="28"
        width="56"
        height="56"
        fill="currentColor"
      />
    </svg>
  );
}

function RingsPattern() {
  return (
    <svg
      className={patternClassName}
      viewBox="0 0 480 128"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern
          id="preview-rings"
          width="96"
          height="96"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="48" cy="48" r="16" fill="none" stroke="currentColor" />
          <circle cx="48" cy="48" r="32" fill="none" stroke="currentColor" />
          <circle cx="48" cy="48" r="48" fill="none" stroke="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#preview-rings)" />
      <circle
        className="text-primary/25"
        cx="336"
        cy="48"
        r="16"
        fill="currentColor"
      />
    </svg>
  );
}

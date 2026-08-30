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

const artworkPatternClass: Record<DemoLink["pattern"], string> = {
  nodes:
    "bg-[radial-gradient(circle_at_20%_45%,currentColor_0_2px,transparent_2.5px),radial-gradient(circle_at_55%_20%,currentColor_0_2px,transparent_2.5px),linear-gradient(135deg,transparent_48%,currentColor_49%_51%,transparent_52%)] bg-[length:80px_64px]",
  waves:
    "bg-[repeating-radial-gradient(ellipse_at_center,transparent_0_16px,currentColor_17px_18px,transparent_19px_32px)]",
  contours:
    "bg-[repeating-radial-gradient(ellipse_at_30%_70%,transparent_0_18px,currentColor_19px_20px,transparent_21px_36px)]",
  grid: "bg-[linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] bg-[size:28px_28px]",
  rings:
    "bg-[repeating-radial-gradient(circle_at_30%_50%,transparent_0_15px,currentColor_16px_17px,transparent_18px_31px)]",
};

function DemoArtwork({ pattern }: { pattern: DemoLink["pattern"] }) {
  return (
    <div
      aria-hidden="true"
      className="relative h-36 overflow-hidden rounded-md border border-border/80 bg-muted/30 sm:h-44"
    >
      <div
        className={cn(
          "absolute inset-0 text-muted-foreground/20",
          artworkPatternClass[pattern]
        )}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_40%,color-mix(in_oklch,var(--primary)_25%,transparent),transparent_18%),linear-gradient(135deg,transparent,color-mix(in_oklch,var(--background)_65%,transparent))]" />
    </div>
  );
}

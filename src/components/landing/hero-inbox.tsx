import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { CheckIcon, RotateCcwIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Status = "inbox" | "completed";

type DemoLink = {
  id: string;
  title: string;
  domain: string;
  tag: string;
  favicon: string;
  thumb: string;
  status: Status;
};

type SeedLink = Omit<DemoLink, "status">;

const SEED: readonly SeedLink[] = [
  {
    id: "attention",
    title: "Attention Is All You Need",
    domain: "arxiv.org",
    tag: "papers",
    favicon: "/favicons/arxiv.png",
    thumb: "linear-gradient(135deg,#1a2240,#3a4a78)",
  },
  {
    id: "botanical-garden",
    title: "A walk through the New York Botanical Garden",
    domain: "nytimes.com",
    tag: "travel",
    favicon: "/favicons/nytimes.png",
    thumb: "linear-gradient(135deg,#2b5e3a,#73a755)",
  },
  {
    id: "city-noise",
    title: "Why Cities Are So Loud — A Video Essay",
    domain: "youtube.com",
    tag: "watch",
    favicon: "/favicons/youtube.png",
    thumb: "linear-gradient(135deg,#3a2e2a,#7a4f3a)",
  },
  {
    id: "burial",
    title: "Untrue — Burial",
    domain: "burial.bandcamp.com",
    tag: "music",
    favicon: "/favicons/bandcamp.png",
    thumb: "linear-gradient(135deg,#2c2540,#5b4a78)",
  },
  {
    id: "roast-chicken",
    title: "The Best Roast Chicken (Seriously)",
    domain: "seriouseats.com",
    tag: "cook",
    favicon: "/favicons/seriouseats.png",
    thumb: "linear-gradient(135deg,#caa471,#8c5a2c)",
  },
  {
    id: "typescript",
    title: "microsoft/typescript: JavaScript with types",
    domain: "github.com",
    tag: "code",
    favicon: "/favicons/github.png",
    thumb: "linear-gradient(135deg,#1a1a1a,#404040)",
  },
  {
    id: "hn-hobby",
    title: "Ask HN: What's a hobby that changed your life?",
    domain: "news.ycombinator.com",
    tag: "hn",
    favicon: "/favicons/hn.png",
    thumb: "linear-gradient(135deg,#ff6600,#ffaa55)",
  },
  {
    id: "finishing-books",
    title: "How I finally finished the books on my shelf",
    domain: "x.com",
    tag: "thread",
    favicon: "/favicons/x.png",
    thumb: "linear-gradient(135deg,#15202b,#3a4856)",
  },
  {
    id: "heat-death",
    title: "Heat death of the universe — Wikipedia",
    domain: "en.wikipedia.org",
    tag: "wiki",
    favicon: "/favicons/wikipedia.png",
    thumb: "linear-gradient(135deg,#eaeaea,#a5a5a5)",
  },
  {
    id: "past-lives",
    title: "Past Lives (2023) — a quiet masterpiece",
    domain: "letterboxd.com",
    tag: "movies",
    favicon: "/favicons/letterboxd.png",
    thumb: "linear-gradient(135deg,#1c2128,#445566)",
  },
  {
    id: "stripe-atlas",
    title: "Stripe Atlas: starting a company from scratch",
    domain: "stripe.com",
    tag: "business",
    favicon: "/favicons/stripe.png",
    thumb: "linear-gradient(135deg,#635bff,#8e88ff)",
  },
  {
    id: "letters-again",
    title: "Why I started writing letters again",
    domain: "theatlantic.com",
    tag: "essay",
    favicon: "/favicons/theatlantic.png",
    thumb: "linear-gradient(135deg,#5c2a2a,#8e3838)",
  },
  {
    id: "rick-rubin",
    title: "Rick Rubin on creativity and listening",
    domain: "lexfridman.com",
    tag: "podcast",
    favicon: "/favicons/lexfridman.png",
    thumb: "linear-gradient(135deg,#2d3142,#4a5168)",
  },
  {
    id: "brat-review",
    title: "Charli XCX – BRAT (deluxe) reviewed",
    domain: "pitchfork.com",
    tag: "music",
    favicon: "/favicons/pitchfork.png",
    thumb: "linear-gradient(135deg,#7fce6b,#3aa520)",
  },
  {
    id: "team-meetings",
    title: "How to keep team meetings short and useful",
    domain: "linear.app",
    tag: "work",
    favicon: "/favicons/linear.png",
    thumb: "linear-gradient(135deg,#5e6ad2,#8a93e0)",
  },
  {
    id: "personal-site",
    title: "Designing a personal site that lasts a decade",
    domain: "vercel.com",
    tag: "blog",
    favicon: "/favicons/vercel.png",
    thumb: "linear-gradient(135deg,#0a0a0a,#3a3a3a)",
  },
  {
    id: "recipe-api",
    title: "A weekend project: an API for my recipe collection",
    domain: "fastapi.tiangolo.com",
    tag: "hobby",
    favicon: "/favicons/fastapi.png",
    thumb: "linear-gradient(135deg,#009688,#4db6ac)",
  },
  {
    id: "ernaux-years",
    title: "Annie Ernaux – The Years",
    domain: "goodreads.com",
    tag: "books",
    favicon: "/favicons/goodreads.png",
    thumb: "linear-gradient(135deg,#553b08,#8a6228)",
  },
  {
    id: "saturday-mix",
    title: "Saturday afternoon — a slow playlist",
    domain: "open.spotify.com",
    tag: "music",
    favicon: "/favicons/spotify.png",
    thumb: "linear-gradient(135deg,#1ed760,#168f40)",
  },
  {
    id: "wedding-design",
    title: "Designing a wedding invitation, step by step",
    domain: "figma.com",
    tag: "design",
    favicon: "/favicons/figma.png",
    thumb: "linear-gradient(135deg,#f24e1e,#a259ff)",
  },
  {
    id: "keyboard-ask",
    title: "What's a good keyboard for typing all day?",
    domain: "reddit.com",
    tag: "ask",
    favicon: "/favicons/reddit.png",
    thumb: "linear-gradient(135deg,#ff4500,#ff8a55)",
  },
  {
    id: "apple-chips",
    title: "Apple's quiet revolution in chips",
    domain: "theverge.com",
    tag: "tech",
    favicon: "/favicons/theverge.png",
    thumb: "linear-gradient(135deg,#5200ff,#9a55ff)",
  },
];

const INITIAL_VISIBLE = 6;
const PRESEEDED_COMPLETED: ReadonlySet<string> = new Set([
  "attention",
  "burial",
  "roast-chicken",
]);

const toDemoLink = (l: SeedLink): DemoLink => ({
  ...l,
  status: PRESEEDED_COMPLETED.has(l.id) ? "completed" : "inbox",
});
const toInbox = (l: SeedLink): DemoLink => ({ ...l, status: "inbox" });

type Store = {
  links: DemoLink[];
  pool: DemoLink[];
  addNext: () => boolean;
  toggle: (id: string) => void;
};

const useHeroDemoStore = create<Store>((set, get) => ({
  links: SEED.slice(0, INITIAL_VISIBLE).map(toDemoLink).toReversed(),
  pool: SEED.slice(INITIAL_VISIBLE).map(toInbox),
  addNext: () => {
    const { pool, links } = get();
    if (pool.length === 0) return false;
    const [next, ...rest] = pool;
    set({ pool: rest, links: [next, ...links] });
    return true;
  },
  toggle: (id) =>
    set((state) => {
      const found = state.links.find((l) => l.id === id);
      if (!found) return state;
      const others = state.links.filter((l) => l.id !== id);
      const flipped: DemoLink = {
        ...found,
        status: found.status === "inbox" ? "completed" : "inbox",
      };
      return { links: [flipped, ...others] };
    }),
}));

export function HeroInbox() {
  const links = useHeroDemoStore((s) => s.links);
  const [tab, setTab] = useState<Status>("inbox");

  const inbox = useMemo(
    () => links.filter((l) => l.status === "inbox"),
    [links]
  );
  const completed = useMemo(
    () => links.filter((l) => l.status === "completed"),
    [links]
  );

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let addedCount = 0;

    const nextDelay = () => {
      if (addedCount === 0) return 800;
      if (addedCount === 1) return 3200;
      return 6400 + Math.random() * 1600;
    };

    const tick = () => {
      const ok = useHeroDemoStore.getState().addNext();
      if (!ok) return;
      addedCount += 1;
      timeoutId = setTimeout(tick, nextDelay());
    };

    timeoutId = setTimeout(tick, nextDelay());

    return () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, []);

  const onToggle = (id: string) => useHeroDemoStore.getState().toggle(id);

  return (
    <div className="select-none overflow-hidden rounded-md border border-border/80 bg-background">
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as Status)}
        className="gap-0"
      >
        <TabsList
          variant="line"
          className="relative h-auto w-full justify-start gap-1 rounded-none border-b border-border/80 px-3 py-0"
        >
          <DemoTabTrigger value="inbox" label="Inbox" count={inbox.length} />
          <DemoTabTrigger
            value="completed"
            label="Completed"
            count={completed.length}
          />
          <TabsPrimitive.Indicator className="absolute bottom-[-1px] left-[var(--active-tab-left)] h-px w-[var(--active-tab-width)] bg-foreground transition-[left,width] duration-300 ease-out" />
        </TabsList>

        <TabsContent value="inbox" className="m-0">
          <DemoList
            items={inbox}
            emptyLabel="Inbox zero. Nice."
            onToggle={onToggle}
          />
        </TabsContent>
        <TabsContent value="completed" className="m-0">
          <DemoList
            items={completed}
            emptyLabel="Mark a link to file it here."
            onToggle={onToggle}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DemoTabTrigger({
  value,
  label,
  count,
}: {
  value: Status;
  label: string;
  count: number;
}) {
  return (
    <TabsTrigger
      value={value}
      className="h-auto rounded-none px-3 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors after:hidden hover:text-foreground data-active:bg-transparent data-active:text-foreground first:pl-0"
    >
      {label}
      <span className="ml-1.5 tabular-nums text-muted-foreground/60">
        {count}
      </span>
    </TabsTrigger>
  );
}

function DemoList({
  items,
  emptyLabel,
  onToggle,
}: {
  items: readonly DemoLink[];
  emptyLabel: string;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="h-80 overflow-y-auto px-2 py-1 sm:h-[28.75rem]">
      {items.length === 0 ? (
        <div className="grid h-full place-items-center text-xs text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <ul className="flex flex-col">
          <AnimatePresence initial={false} mode="popLayout">
            {items.map((l) => (
              <motion.li
                key={l.id}
                layout="position"
                initial={{ scale: 0.94, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.94, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <DemoRow link={l} onToggle={() => onToggle(l.id)} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

function DemoRow({ link, onToggle }: { link: DemoLink; onToggle: () => void }) {
  const completed = link.status === "completed";
  const ActionIcon = completed ? RotateCcwIcon : CheckIcon;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={
        completed
          ? `Move "${link.title}" back to inbox`
          : `Mark "${link.title}" complete`
      }
      className="group grid w-full cursor-pointer grid-cols-[1fr_4.75rem] items-start gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-muted"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <div
          className={cn(
            "truncate text-[15px] font-medium leading-snug",
            completed && "text-muted-foreground"
          )}
        >
          {link.title}
        </div>
        <div className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            <img
              src={link.favicon}
              alt=""
              width={12}
              height={12}
              className="size-3 shrink-0 rounded-[2px] object-contain ring-1 ring-black/[0.08] dark:ring-white/10"
              decoding="async"
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
            />
            <span className="truncate font-medium text-foreground/80">
              {link.domain}
            </span>
          </span>
          <span className="whitespace-nowrap">
            <span className="text-muted-foreground/50">#</span>
            {link.tag}
          </span>
        </div>
      </div>
      <div
        className="relative aspect-[16/9] overflow-hidden rounded-sm"
        aria-hidden="true"
      >
        <div
          className={cn(
            "absolute inset-0 transition-opacity",
            completed && "opacity-50"
          )}
          style={{ background: link.thumb }}
        />
        <div className="absolute inset-0 grid place-items-center bg-foreground/45 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <span className="grid size-7 place-items-center rounded-full bg-background text-foreground shadow-sm transition-transform duration-150 group-hover:scale-100 scale-90">
            <ActionIcon className="size-3.5" strokeWidth={2.5} />
          </span>
        </div>
      </div>
    </button>
  );
}

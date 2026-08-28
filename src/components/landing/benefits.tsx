export function BenefitsGrid() {
  return (
    <ul className="grid gap-14 lg:grid-cols-3 lg:gap-8 xl:gap-10">
      <StoryStep
        number="01"
        action="Find it"
        title="Find anything you saved."
        body="Search titles, sites, tags, and summaries—even when you only remember the idea."
        visual={<SearchStory />}
      />
      <StoryStep
        number="02"
        action="Understand it"
        title="Know what’s worth opening."
        body="Read a clear summary first, then open the original when you need the full story."
        visual={<SummaryStory />}
      />
      <StoryStep
        number="03"
        action="Use it"
        title="Ask about what you saved."
        body="Ask a question and get an answer with links back to the original sources."
        visual={<AnswerStory />}
      />
    </ul>
  );
}

function StoryStep({
  number,
  action,
  title,
  body,
  visual,
}: {
  number: string;
  action: string;
  title: string;
  body: string;
  visual: React.ReactNode;
}) {
  return (
    <li className="flex min-w-0 flex-col">
      <div className="mb-4 flex items-center gap-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em]">
        <span className="text-primary">{number}</span>
        <span className="text-muted-foreground">{action}</span>
      </div>
      <div
        aria-hidden="true"
        className="h-[13rem] overflow-hidden rounded-lg border border-border/70 bg-background p-5"
      >
        {visual}
      </div>
      <h3 className="mt-5 text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 max-w-[36ch] text-pretty text-sm leading-relaxed text-muted-foreground lg:min-h-[4.5rem]">
        {body}
      </p>
    </li>
  );
}

function SearchStory() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 font-mono text-xs text-foreground/80">
        weekend in lisbon
        <span className="landing-search-cursor ml-0.5 inline-block h-[1em] w-0.5 translate-y-[0.15em] rounded-full bg-primary" />
      </div>
      <div className="rounded-md bg-muted/55 p-3">
        <SavedLink />
        <p className="mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">
          A relaxed three-day plan for food, walks, and the river.
        </p>
      </div>
    </div>
  );
}

function SummaryStory() {
  return (
    <div className="flex h-full flex-col gap-4">
      <SavedLink />
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
          AI summary
        </div>
        <p className="mt-2 text-pretty text-[12.5px] leading-relaxed text-foreground/80">
          Spend three days exploring old neighborhoods, small restaurants, and
          the riverfront, with plenty of time left unscheduled.
        </p>
      </div>
    </div>
  );
}

function AnswerStory() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="ml-auto max-w-[88%] rounded-xl rounded-br-sm bg-muted px-3 py-2 text-[12px] leading-snug text-foreground">
        Do I need a car?
      </div>
      <div className="text-[12.5px] leading-relaxed text-foreground/80">
        No. Most stops are walkable, and trams cover the longer trips.
      </div>
      <div className="mt-auto flex min-w-0 items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-2.5 py-2">
        <SourceMark />
        <span className="truncate text-[11px] font-medium">
          A Weekend in Lisbon
        </span>
        <span className="ml-auto shrink-0 font-mono text-[9.5px] text-muted-foreground">
          source
        </span>
      </div>
    </div>
  );
}

function SavedLink() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <SourceMark />
      <div className="min-w-0">
        <div className="truncate text-[12.5px] font-semibold tracking-tight">
          A Weekend in Lisbon
        </div>
        <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          lonelyplanet.com · #travel
        </div>
      </div>
    </div>
  );
}

function SourceMark() {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 font-serif text-xs font-semibold text-primary">
      L
    </span>
  );
}

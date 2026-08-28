import { ArrowDownToLineIcon, SearchIcon, SparklesIcon } from "lucide-react";

import { SHELL } from "./shared";

const OUTCOMES = [
  {
    title: "Save anywhere",
    body: "Paste a URL, forward from Telegram, sync X bookmarks, or save from Raycast.",
    icon: ArrowDownToLineIcon,
  },
  {
    title: "Skim quickly",
    body: "See the source, preview, and concise summary before opening the original.",
    icon: SparklesIcon,
  },
  {
    title: "Find it later",
    body: "Search by what a link says, not only by the title you happen to remember.",
    icon: SearchIcon,
  },
] as const;

export function Pitch() {
  return (
    <section
      id="how"
      className="relative border-b border-border/60 bg-background pb-16 pt-6 sm:pb-20 sm:pt-8 lg:pb-24"
    >
      <div className={SHELL}>
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
          <div className="border-b border-border/70 px-6 py-6 text-center sm:px-8 sm:py-7">
            <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-primary">
              One simple loop
            </div>
            <h2 className="mt-2 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
              Save it. Understand it. Find it again.
            </h2>
          </div>
          <ol className="grid divide-y divide-border/70 md:grid-cols-3 md:divide-x md:divide-y-0">
            {OUTCOMES.map(({ title, body, icon: Icon }, index) => (
              <li
                key={title}
                className="relative px-6 py-7 text-center sm:px-8 sm:py-8 md:text-left"
              >
                <div className="flex items-center justify-center gap-3 md:justify-start">
                  <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                    <Icon
                      className="size-4"
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                  </span>
                  <span className="font-mono text-[10px] font-semibold tabular-nums text-muted-foreground">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold tracking-tight">
                  {title}
                </h3>
                <p className="mx-auto mt-2 max-w-[38ch] text-pretty text-sm leading-relaxed text-muted-foreground md:mx-0">
                  {body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

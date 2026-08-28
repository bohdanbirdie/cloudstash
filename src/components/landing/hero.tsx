import { Link } from "@tanstack/react-router";

import {
  ChromeLogo,
  RaycastLogo,
  TelegramLogo,
  XLogo,
} from "@/components/integrations/integration-icons";
import { Button } from "@/components/ui/button";

import { HeroInbox } from "./hero-inbox";
import { SHELL } from "./shared";

const SAVE_SOURCES = [
  {
    label: "X bookmarks",
    icon: XLogo,
    side: "left",
    position: "top-[26%]",
    bend: "down",
    delay: "0s",
    iconClassName: "bg-foreground/5 text-foreground",
  },
  {
    label: "Telegram",
    icon: TelegramLogo,
    side: "left",
    position: "top-[68%]",
    bend: "up",
    delay: "3s",
    iconClassName: "bg-[#26A5E4]/10 text-[#229ED9]",
  },
  {
    label: "Chrome",
    icon: ChromeLogo,
    side: "right",
    position: "top-[30%]",
    bend: "down",
    delay: "1.5s",
    iconClassName: "bg-[#4285F4]/10 text-[#4285F4]",
  },
  {
    label: "Raycast",
    icon: RaycastLogo,
    side: "right",
    position: "top-[72%]",
    bend: "up",
    delay: "4.5s",
    iconClassName: "bg-[#FF6363]/10 text-[#FF6363]",
  },
] as const;

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-background">
      <HeroBackdrop />
      <div
        className={`relative ${SHELL} pb-14 pt-28 sm:pb-18 sm:pt-32 lg:pb-20 lg:pt-40`}
      >
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <h1 className="text-balance text-5xl font-bold leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-[5.25rem]">
            Saved links,
            <span className="block text-primary">made useful.</span>
          </h1>
          <p className="mt-6 max-w-[62ch] text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg lg:text-xl">
            Turn scattered saves into one private, searchable library with clear
            previews and concise summaries.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button
              nativeButton={false}
              render={<Link to="/login" />}
              size="lg"
              className="h-12 px-7 text-base"
            >
              Start saving links
            </Button>
            <a
              href="#how"
              className="group inline-flex h-12 items-center gap-1.5 rounded-md px-3 text-base font-medium text-foreground outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              See how it works
              <span
                aria-hidden="true"
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              >
                →
              </span>
            </a>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Free to try. No credit card.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 text-xs text-muted-foreground sm:flex-row sm:gap-5 min-[96rem]:hidden">
            <span className="text-[0.625rem] font-semibold uppercase tracking-[0.12em]">
              Save from
            </span>
            <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
              {SAVE_SOURCES.map(({ label, icon: Icon }) => (
                <li key={label} className="inline-flex items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-full bg-primary/10 text-primary">
                    <Icon className="size-3.5" />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="relative z-20 mx-auto mt-14 max-w-6xl sm:mt-16 lg:mt-20">
          <div className="relative mx-auto max-w-5xl">
            <HeroSourceNodes />
            <div
              aria-hidden="true"
              className="absolute inset-x-6 -bottom-4 top-4 rounded-xl border border-primary/15 bg-primary/8"
            />
            <div className="relative z-10 rounded-xl border border-primary/20 bg-background/90 p-1.5 text-foreground shadow-2xl shadow-primary/10">
              <HeroInbox />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="landing-dot-field absolute inset-0" />
    </div>
  );
}

function HeroSourceNodes() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 hidden min-[96rem]:block"
    >
      {SAVE_SOURCES.map(
        ({ label, icon: Icon, side, position, bend, delay, iconClassName }) => (
          <div
            key={label}
            className={`absolute ${position} flex -translate-y-1/2 items-center ${side === "left" ? "right-full" : "left-full flex-row-reverse"}`}
          >
            <div
              className={`relative z-20 flex items-center gap-2.5 rounded-full border border-border/80 bg-background/90 py-1.5 ${side === "left" ? "flex-row-reverse pl-3 pr-1.5" : "pl-1.5 pr-3"}`}
            >
              <span
                className={`grid size-8 place-items-center rounded-full ${iconClassName}`}
              >
                <Icon className="size-4" />
              </span>
              <span className="whitespace-nowrap text-xs font-medium text-foreground">
                {label}
              </span>
            </div>
            <SourceArc side={side} bend={bend} delay={delay} />
          </div>
        )
      )}
    </div>
  );
}

function SourceArc({
  side,
  bend,
  delay,
}: {
  side: "left" | "right";
  bend: "up" | "down";
  delay: string;
}) {
  const path = getSourceArcPath(side, bend);
  const gradientId = `source-traveler-gradient-${side}-${bend}`;
  const maskId = `source-traveler-mask-${side}-${bend}`;
  const travelsRight = side === "left";

  return (
    <span className="relative z-0 h-14 w-30">
      <svg
        viewBox="0 0 120 56"
        className="absolute inset-0 size-full overflow-visible"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient
            id={gradientId}
            x1={travelsRight ? "0%" : "100%"}
            x2={travelsRight ? "100%" : "0%"}
            y1="0%"
            y2="0%"
          >
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="55%" stopColor="white" stopOpacity="0.55" />
            <stop offset="100%" stopColor="white" />
          </linearGradient>
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            x="-32"
            y="0"
            width="184"
            height="56"
            style={{ maskType: "alpha" }}
          >
            <rect
              className="landing-source-traveler-mask"
              fill={`url(#${gradientId})`}
              height="56"
              width="32"
              x={travelsRight ? -32 : 120}
              y="0"
              style={
                {
                  animationDelay: delay,
                  "--landing-source-travel-distance": travelsRight
                    ? "120px"
                    : "-120px",
                } as React.CSSProperties
              }
            />
          </mask>
        </defs>
        <path
          d={path}
          fill="none"
          stroke="var(--border)"
          strokeWidth="1.25"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={path}
          fill="none"
          mask={`url(#${maskId})`}
          stroke="var(--primary)"
          strokeLinecap="round"
          strokeWidth="2.7"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  );
}

function getSourceArcPath(side: "left" | "right", bend: "up" | "down") {
  if (side === "left") {
    return bend === "down"
      ? "M0 28 C44 28 68 48 120 48"
      : "M0 28 C44 28 68 8 120 8";
  }

  return bend === "down"
    ? "M120 28 C76 28 52 48 0 48"
    : "M120 28 C76 28 52 8 0 8";
}

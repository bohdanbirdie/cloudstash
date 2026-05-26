import { Link } from "@tanstack/react-router";

import { Button, buttonVariants } from "@/components/ui/button";
import { TextLoop } from "@/components/ui/text-loop";

import { HeroInbox } from "./hero-inbox";
import { SHELL } from "./shared";

const HERO_VERBS = [
  "Skim summaries.",
  "Read later.",
  "Find anything.",
  "Forget nothing.",
];

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <HeroBackdrop />
      <div className={`${SHELL} relative py-16 sm:py-20 lg:py-24`}>
        <div className="grid gap-12 lg:grid-cols-[5fr_6fr] lg:items-center lg:gap-16">
          <div>
            <h1 className="mb-5 text-5xl font-bold leading-[1.02] tracking-[-0.02em] sm:leading-[1.05] sm:tracking-tight">
              <span className="block">Save links.</span>
              <TextLoop
                className="text-primary"
                interval={2.8}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                {HERO_VERBS.map((phrase) => (
                  <span key={phrase}>{phrase}</span>
                ))}
              </TextLoop>
            </h1>
            <p className="mb-7 max-w-[52ch] text-pretty text-base leading-relaxed text-muted-foreground">
              Send links from Telegram, Raycast, your phone, or anywhere on the
              web. Cloudstash saves them with an AI summary so you can{" "}
              <span className="font-italic-accent text-foreground">skim</span>{" "}
              before you read.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                render={<Link to="/login" />}
                size="lg"
                className="h-11 px-6 text-sm"
              >
                Save your first link
              </Button>
              <a
                href="#how"
                className={buttonVariants({
                  variant: "ghost",
                  size: "lg",
                  className:
                    "h-11 px-5 text-sm focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                })}
              >
                See how it works
              </a>
            </div>
          </div>

          <div className="relative rounded-md shadow-[0_24px_60px_-32px_oklch(0.61_0.22_39_/_0.45),0_2px_8px_-4px_oklch(0_0_0_/_0.08)]">
            <HeroInbox />
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
      className="pointer-events-none absolute inset-0 -z-10"
    >
      {/* Warm orange glow under the inbox — anchors the card without a mesh gradient. */}
      <div
        className="absolute -top-24 right-[-15%] h-[42rem] w-[42rem] rounded-full opacity-70 blur-[120px]"
        style={{ backgroundColor: "oklch(0.85 0.16 65 / 0.5)" }}
      />
    </div>
  );
}

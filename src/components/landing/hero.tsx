import { Link } from "@tanstack/react-router";

import { Button, buttonVariants } from "@/components/ui/button";

import { HeroInbox } from "./hero-inbox";
import { SHELL } from "./shared";

export function Hero() {
  return (
    <section id="top" className={`${SHELL} py-16 sm:py-20 lg:py-24`}>
      <div className="grid gap-12 lg:grid-cols-[5fr_6fr] lg:items-center lg:gap-16">
        <div>
          <h1 className="mb-5 text-balance text-3xl font-bold leading-[1.05] tracking-tight sm:text-4xl lg:text-5xl">
            Save links. <span className="text-primary">Skim summaries.</span>
          </h1>
          <p className="mb-7 max-w-[52ch] text-pretty text-base leading-relaxed text-muted-foreground">
            Send links from Telegram, Raycast, your phone, or anywhere on the
            web. Cloudstash saves them with an AI summary so you can skim before
            you read.
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

        <HeroInbox />
      </div>
    </section>
  );
}

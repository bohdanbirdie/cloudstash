import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

import { LandingEyebrow, SHELL } from "./shared";

export function Closer() {
  return (
    <section className="border-t border-border/60 bg-muted/30 py-16 sm:py-20 lg:py-24">
      <div className={`${SHELL} flex flex-col items-center text-center`}>
        <LandingEyebrow>Join the alpha</LandingEyebrow>
        <h2 className="mt-2 text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          Save your first link.
        </h2>
        <p className="mt-3 max-w-[48ch] text-pretty text-sm leading-relaxed text-muted-foreground">
          Sign up, paste a URL, see what Cloudstash does with it. Takes a
          minute.
        </p>
        <div className="mt-7 flex flex-col items-center gap-3">
          <Button
            render={<Link to="/login" />}
            size="lg"
            className="h-12 px-7 text-base"
          >
            Save your first link
          </Button>
          <span className="text-xs text-muted-foreground">
            No card required.
          </span>
        </div>
      </div>
    </section>
  );
}

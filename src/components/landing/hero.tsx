import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import {
  ChromeLogo,
  RaycastLogo,
  TelegramLogo,
  XLogo,
} from "@/components/integrations/integration-icons";
import { Button } from "@/components/ui/button";
import { PALETTES, paintDitherToContext } from "@/lib/brand/dither";

import { HeroInbox } from "./hero-inbox";
import { SHELL } from "./shared";

const SUNSET = PALETTES.find((p) => p.name === "Sunset")!;
const DITHER_CELL = 3;

export function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden bg-primary text-primary-foreground"
    >
      <HeroBackdrop />
      <div className={`relative ${SHELL} py-16 sm:py-20 lg:py-36`}>
        <div className="grid gap-12 lg:grid-cols-[6fr_5fr] lg:items-center lg:gap-16">
          <div>
            <div className="mb-5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-primary-foreground/75">
              a private inbox for saved links
            </div>
            <h1 className="mb-6 text-5xl font-bold leading-[1.04] tracking-[-0.02em]">
              <span className="block">Save the link.</span>
              <span className="mt-2 block">Keep the context.</span>
            </h1>
            <p className="mb-8 max-w-[52ch] text-pretty text-base font-normal leading-relaxed text-primary-foreground sm:text-lg lg:text-xl">
              Cloudstash keeps saved links in one searchable inbox, with clear
              previews and concise summaries.
            </p>
            <div className="flex flex-wrap items-center gap-5">
              <Button
                nativeButton={false}
                render={<Link to="/login" />}
                size="lg"
                className="h-12 bg-foreground px-7 text-base text-background hover:bg-foreground/85 focus-visible:ring-2 focus-visible:ring-primary-foreground/50 focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
              >
                Save your first link
              </Button>
              <a
                href="#how"
                className="group inline-flex items-center gap-1.5 rounded-sm text-base italic text-primary-foreground/85 underline-offset-[6px] outline-none transition-colors hover:text-primary-foreground hover:underline focus-visible:ring-2 focus-visible:ring-primary-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
              >
                see how it works
                <span
                  aria-hidden="true"
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                >
                  →
                </span>
              </a>
            </div>
            <p className="mt-6 text-sm italic text-primary-foreground/65">
              Free to try — no credit card.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-primary-foreground/65">
              <span className="text-[0.625rem] font-semibold uppercase tracking-[0.12em]">
                Save from
              </span>
              <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <li className="inline-flex items-center gap-1.5">
                  <XLogo className="size-3.5" />
                  X bookmarks
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <TelegramLogo className="size-3.5" />
                  Telegram
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <ChromeLogo className="size-3.5" />
                  Chrome
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <RaycastLogo className="size-3.5" />
                  Raycast
                </li>
              </ul>
            </div>
          </div>

          <div className="relative rounded-md text-foreground shadow-[0_28px_70px_-32px_oklch(0.22_0.08_35_/_0.55),0_2px_10px_-4px_oklch(0.18_0.06_30_/_0.35)]">
            <HeroInbox />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <HeroDither />
    </div>
  );
}

function HeroDither() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function paint() {
      const rect = canvas!.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const w = Math.ceil(rect.width);
      const h = Math.ceil(rect.height);
      canvas!.width = w;
      canvas!.height = h;
      paintDitherToContext(ctx!, w, h, DITHER_CELL, SUNSET);

      ctx!.globalCompositeOperation = "destination-out";

      const vgrad = ctx!.createLinearGradient(0, 0, 0, h);
      vgrad.addColorStop(0, "rgba(0,0,0,1)");
      vgrad.addColorStop(0.63, "rgba(0,0,0,1)");
      vgrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx!.fillStyle = vgrad;
      ctx!.fillRect(0, 0, w, h);

      ctx!.globalCompositeOperation = "source-over";
    }

    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="absolute inset-0 size-full opacity-[0.16]"
      style={{ imageRendering: "pixelated" }}
    />
  );
}

import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

const STEP = 18;
const CELLS = 12;
// Seconds a period, and where in it a dot starts: the Mac app's sign-in uses the same four.
const TWINKLES = [
  [3.7, 0],
  [5.3, 0.35],
  [6.1, 0.7],
  [7.9, 0.15],
] as const;

function owner(i: number) {
  let h = (i + 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) % TWINKLES.length;
}

const SPAN = STEP * CELLS;
const LAYERS = TWINKLES.map(([period, phase], layer) => {
  const dots = Array.from({ length: CELLS * CELLS }, (_, i) => i)
    .filter((i) => owner(i) === layer)
    .map(
      (i) =>
        `<circle cx='${(i % CELLS) * STEP + STEP / 2}' cy='${Math.floor(i / CELLS) * STEP + STEP / 2}' r='1.125'/>`
    )
    .join("");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${SPAN}' height='${SPAN}'>${dots}</svg>`;
  return {
    "--twinkle-mask": `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    "--twinkle-size": `${SPAN}px ${SPAN}px`,
    "--twinkle-period": `${period}s`,
    "--twinkle-delay": `${-phase * period}s`,
  } as CSSProperties;
});

/** The sign-in card's dot grid: each dot brightens and dims slowly, out of step with its neighbours. */
export function TwinkleDots({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("twinkle-dots", className)}>
      {LAYERS.map((style, i) => (
        <span key={i} style={style} />
      ))}
    </div>
  );
}

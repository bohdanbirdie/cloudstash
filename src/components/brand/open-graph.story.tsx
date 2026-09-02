import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";

import { FAN, fanSegments } from "@/lib/brand/fan";

// This story stays on canvas: it renders text, and rasterizing SVG text
// through an <img> loses the document's loaded fonts.

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const SCALE = 2;
const PREVIEW_WIDTHS = [600, 420, 280] as const;
const COLORS = {
  background: "#ffffff",
  paperBottom: "#fafafa",
  foreground: "#18181b",
  muted: "#71717a",
} as const;

const WORDMARK = "cloudstash";
const TAGLINE_QUIET = "Saved links, ";
const TAGLINE_LOUD = "made useful.";
const FONT = "'Noto Sans Variable', sans-serif";

const HERO = {
  fanDia: 320,
  fanStroke: 1.6,
  gapWordmark: 36,
  wordmarkSize: 76,
  gapTagline: 34,
  taglineSize: 31,
};

function heroLayout() {
  const fanVisH = (64 / 120) * HERO.fanDia;
  const blockH =
    fanVisH +
    HERO.gapWordmark +
    HERO.wordmarkSize +
    HERO.gapTagline +
    HERO.taglineSize;
  const top = (OG_HEIGHT - blockH) / 2;
  const wordmarkBaseline =
    top + fanVisH + HERO.gapWordmark + HERO.wordmarkSize * 0.78;
  return {
    fanCenterY: top + fanVisH / 2,
    wordmarkBaseline,
    taglineBaseline: wordmarkBaseline + HERO.gapTagline + HERO.taglineSize,
  };
}

// HERO.fanStroke is tuned for the ~50% downscale OG cards are shown at,
// not the brand stroke rule.
function drawHeroFan(ctx: CanvasRenderingContext2D, centerY: number) {
  const factor = HERO.fanDia / 120;
  ctx.strokeStyle = COLORS.foreground;
  ctx.lineWidth = HERO.fanStroke;
  ctx.lineCap = "round";
  fanSegments(FAN).forEach((s) => {
    ctx.beginPath();
    ctx.moveTo(
      OG_WIDTH / 2 + (s.x1 - 60) * factor,
      centerY + (s.y1 - 60) * factor
    );
    ctx.lineTo(
      OG_WIDTH / 2 + (s.x2 - 60) * factor,
      centerY + (s.y2 - 60) * factor
    );
    ctx.stroke();
  });
}

function drawWordmark(ctx: CanvasRenderingContext2D, baseline: number) {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.foreground;
  ctx.letterSpacing = `${(-0.015 * HERO.wordmarkSize).toFixed(2)}px`;
  ctx.font = `650 ${HERO.wordmarkSize}px ${FONT}`;
  ctx.fillText(WORDMARK, OG_WIDTH / 2, baseline);
  ctx.letterSpacing = "0px";
}

function drawTagline(ctx: CanvasRenderingContext2D, baseline: number) {
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const quietFont = `400 ${HERO.taglineSize}px ${FONT}`;
  const loudFont = `500 ${HERO.taglineSize}px ${FONT}`;
  ctx.font = quietFont;
  const quietW = ctx.measureText(TAGLINE_QUIET).width;
  ctx.font = loudFont;
  const loudW = ctx.measureText(TAGLINE_LOUD).width;
  const startX = (OG_WIDTH - quietW - loudW) / 2;

  ctx.fillStyle = COLORS.muted;
  ctx.font = quietFont;
  ctx.fillText(TAGLINE_QUIET, startX, baseline);
  ctx.fillStyle = COLORS.foreground;
  ctx.font = loudFont;
  ctx.fillText(TAGLINE_LOUD, startX + quietW, baseline);
}

function renderOpenGraphCanvas(): HTMLCanvasElement {
  const supersampled = document.createElement("canvas");
  supersampled.width = OG_WIDTH * SCALE;
  supersampled.height = OG_HEIGHT * SCALE;
  const ctx = supersampled.getContext("2d")!;
  ctx.scale(SCALE, SCALE);

  const paper = ctx.createLinearGradient(0, 0, 0, OG_HEIGHT);
  paper.addColorStop(0, COLORS.background);
  paper.addColorStop(0.6, COLORS.background);
  paper.addColorStop(1, COLORS.paperBottom);
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT);

  const layout = heroLayout();
  drawHeroFan(ctx, layout.fanCenterY);
  drawWordmark(ctx, layout.wordmarkBaseline);
  drawTagline(ctx, layout.taglineBaseline);

  const output = document.createElement("canvas");
  output.width = OG_WIDTH;
  output.height = OG_HEIGHT;
  const outputContext = output.getContext("2d")!;
  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = "high";
  outputContext.drawImage(supersampled, 0, 0, OG_WIDTH, OG_HEIGHT);
  return output;
}

function downloadDataUrl(dataUrl: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = "cloudstash-og-1200x630.png";
  anchor.click();
}

// Dev-only sink (.storybook/main.ts): browser downloads land on the host,
// this writes public/cloudstash-og.png inside the VM.
async function writeToPublic(dataUrl: string): Promise<boolean> {
  const blob = await (await fetch(dataUrl)).blob();
  const response = await fetch("/__brand/save-og", {
    method: "POST",
    body: blob,
  });
  return response.ok;
}

function OpenGraphReview() {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [writeStatus, setWriteStatus] = useState<"idle" | "saved" | "failed">(
    "idle"
  );

  useEffect(() => {
    let active = true;
    void document.fonts.ready.then(() => {
      if (active) setDataUrl(renderOpenGraphCanvas().toDataURL("image/png"));
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-muted/20 p-5 sm:p-8">
      <section className="mx-auto max-w-[1400px] rounded-xl border border-border bg-background p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-foreground">
            Current promise
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              {writeStatus === "saved" && "Written to public/cloudstash-og.png"}
              {writeStatus === "failed" &&
                "Write failed — is this the dev server?"}
            </span>
            <button
              type="button"
              disabled={!dataUrl}
              onClick={() => {
                if (!dataUrl) return;
                void writeToPublic(dataUrl).then((ok) =>
                  setWriteStatus(ok ? "saved" : "failed")
                );
              }}
              className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              Write to public/
            </button>
            <button
              type="button"
              disabled={!dataUrl}
              onClick={() => dataUrl && downloadDataUrl(dataUrl)}
              className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save PNG
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-6">
          {PREVIEW_WIDTHS.map((width) => (
            <figure key={width} className="space-y-2">
              {dataUrl ? (
                <img
                  src={dataUrl}
                  alt={`Cloudstash Open Graph preview at ${width}px wide`}
                  className="h-auto rounded-md outline outline-1 -outline-offset-1 outline-black/10"
                  style={{ width }}
                />
              ) : (
                <div
                  className="aspect-[1200/630] animate-pulse rounded-md bg-muted"
                  style={{ width }}
                />
              )}
              <figcaption className="text-[11px] text-muted-foreground">
                {width}px
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    </main>
  );
}

const meta = {
  title: "Brand/Open Graph",
  component: OpenGraphReview,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof OpenGraphReview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Generator: Story = {};

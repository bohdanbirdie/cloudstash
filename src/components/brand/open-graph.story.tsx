import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";

import { PALETTES, paintDitherToContext } from "@/lib/brand/dither";
import { torusKnotPoint } from "@/lib/brand/torus-knot";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const SCALE = 2;
const PREVIEW_WIDTHS = [600, 420, 280] as const;
const COLORS = {
  background: "#ffffff",
  foreground: "#18181b",
  muted: "#71717a",
  primary: "#e83b00",
} as const;
const MIDNIGHT = PALETTES.find((palette) => palette.name === "Midnight")!;

const HEADLINE = ["Saved links,", "made useful."] as const;
const BODY = "Save from anywhere. Find it when you need it.";

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function drawDotField(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "rgba(232, 59, 0, 0.0576)";
  for (let y = 13; y < OG_HEIGHT; y += 24) {
    for (let x = 13; x < OG_WIDTH; x += 24) {
      ctx.beginPath();
      ctx.arc(x, y, 2.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawKnot(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  diameter: number
) {
  const knotScale = diameter / 2 / 32;
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(Math.PI / 4);
  ctx.translate(-centerX, -centerY);
  ctx.beginPath();
  for (let index = 0; index <= 500; index++) {
    const point = torusKnotPoint(index / 500, {
      R: 22 * knotScale,
      r: 10 * knotScale,
      cx: centerX,
      cy: centerY,
    });
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4.5 * knotScale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
}

function drawBrand(ctx: CanvasRenderingContext2D) {
  const x = 72;
  const y = 60;
  const iconSize = 64;
  const texture = document.createElement("canvas");
  texture.width = 256;
  texture.height = 256;
  paintDitherToContext(
    texture.getContext("2d")!,
    texture.width,
    texture.height,
    3.5,
    MIDNIGHT
  );

  ctx.save();
  roundedRect(ctx, x, y, iconSize, iconSize, 14);
  ctx.clip();
  ctx.drawImage(texture, x, y, iconSize, iconSize);
  ctx.restore();
  drawKnot(ctx, x + iconSize / 2, y + iconSize / 2, 40);

  ctx.fillStyle = COLORS.foreground;
  ctx.font = "650 35px 'Noto Sans Variable', sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("cloudstash", x + 86, y + iconSize / 2 + 1);
}

function drawFunnel(ctx: CanvasRenderingContext2D) {
  ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = "-3px";
  ctx.font = "700 96px 'Noto Sans Variable', sans-serif";
  ctx.fillStyle = COLORS.foreground;
  ctx.fillText(HEADLINE[0], 72, 286);
  ctx.fillStyle = COLORS.primary;
  ctx.fillText(HEADLINE[1], 72, 392);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = COLORS.muted;
  ctx.font = "400 32px 'Noto Sans Variable', sans-serif";
  ctx.fillText(BODY, 76, 478);

  ctx.fillStyle = COLORS.primary;
  ctx.fillRect(76, 548, 88, 4);
}

function renderOpenGraphCanvas(): HTMLCanvasElement {
  const supersampled = document.createElement("canvas");
  supersampled.width = OG_WIDTH * SCALE;
  supersampled.height = OG_HEIGHT * SCALE;
  const ctx = supersampled.getContext("2d")!;
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT);
  drawDotField(ctx);
  drawBrand(ctx);
  drawFunnel(ctx);

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

function OpenGraphReview() {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

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
          <button
            type="button"
            disabled={!dataUrl}
            onClick={() => dataUrl && downloadDataUrl(dataUrl)}
            className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save PNG
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-6">
          {PREVIEW_WIDTHS.map((width) => (
            <figure key={width} className="space-y-2">
              {dataUrl ? (
                <img
                  src={dataUrl}
                  alt={`Cloudstash Open Graph preview at ${width}px wide`}
                  className="h-auto rounded-md ring-1 ring-black/10"
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

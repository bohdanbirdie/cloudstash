import type { Meta, StoryObj } from "@storybook/react-vite";
import { useCallback, useId, useRef } from "react";

import { LoginAnimation } from "@/components/login-animation";
import {
  FAN,
  FAN_TILE_DY,
  fanSegments,
  fanStrokePx,
  fanStrokeViewbox,
} from "@/lib/brand/fan";
import { squirclePath } from "@/lib/brand/squircle";

const PRODUCTION = { name: "paper", ink: "#18181b" };
const STAGING = { name: "staging", ink: "#c2410c" };
type FlatVariant = typeof PRODUCTION;

const TILE_BG_TOP = "#ffffff";
const TILE_BG_BOTTOM = "#fafafa";
const TILE_EDGE_TOP = "#efeff2";
const TILE_EDGE_BOTTOM = "#e3e3e8";
const TILE_EDGE = "#e4e4e7";

const ICON_INSET = 0.62;
const MCP_INSET = 0.55;

type ClipType = "squircle" | "circle" | "raycast" | "square";

function roundedRectPath(r: number): string {
  return `M ${r},0 H ${120 - r} Q 120,0 120,${r} V ${120 - r} Q 120,120 ${120 - r},120 H ${r} Q 0,120 0,${120 - r} V ${r} Q 0,0 ${r},0 Z`;
}

const CLIP_PATHS: Record<ClipType, string> = {
  squircle: squirclePath(60, 60, 60, 5),
  circle: "M 60,0 A 60,60 0 1,1 59.99,0 Z",
  raycast: roundedRectPath(120 * 0.22),
  square: "M 0,0 H 120 V 120 H 0 Z",
};

// usagePx is the device-pixel size the platform shows the asset at; the
// preview renders at exactly that size and the export shares its geometry.
function FanTile({
  variant,
  clip,
  usagePx,
  inset = ICON_INSET,
  svgRef,
}: {
  variant: FlatVariant;
  clip: ClipType;
  usagePx: number;
  inset?: number;
  svgRef?: React.Ref<SVGSVGElement>;
}) {
  const baseId = useId().replace(/:/g, "");
  const fillId = `${baseId}-fill`;
  const edgeId = `${baseId}-edge`;
  const markPx = usagePx * inset;
  return (
    <svg
      ref={svgRef}
      viewBox="0 0 120 120"
      width={usagePx}
      height={usagePx}
      fill="none"
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={TILE_BG_TOP} />
          <stop offset="0.6" stopColor={TILE_BG_TOP} />
          <stop offset="1" stopColor={TILE_BG_BOTTOM} />
        </linearGradient>
        <linearGradient id={edgeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={TILE_EDGE_TOP} />
          <stop offset="1" stopColor={TILE_EDGE_BOTTOM} />
        </linearGradient>
      </defs>
      <path
        d={CLIP_PATHS[clip]}
        fill={`url(#${fillId})`}
        stroke={`url(#${edgeId})`}
        strokeWidth={1}
      />
      <g
        transform={`translate(60 ${60 + FAN_TILE_DY}) scale(${inset}) translate(-60 -60)`}
        stroke={variant.ink}
        strokeWidth={fanStrokeViewbox(markPx)}
        strokeLinecap="round"
      >
        {fanSegments(FAN).map((s, i) => (
          <line
            key={i}
            x1={s.x1.toFixed(2)}
            y1={s.y1.toFixed(2)}
            x2={s.x2.toFixed(2)}
            y2={s.y2.toFixed(2)}
          />
        ))}
      </g>
    </svg>
  );
}

const ROW_ASSETS = [
  {
    label: "App icon",
    note: "Dock · 64pt @2x",
    clip: "squircle",
    exportSize: 1024,
    usagePx: 128,
  },
  {
    label: "Favicon",
    note: "Tab · 16pt @2x",
    clip: "squircle",
    exportSize: 512,
    usagePx: 32,
  },
  {
    label: "Raycast",
    note: "Command list · 24pt @2x",
    clip: "raycast",
    exportSize: 512,
    usagePx: 48,
  },
  {
    label: "Telegram",
    note: "Avatar · 40pt @2x",
    clip: "circle",
    exportSize: 512,
    usagePx: 80,
  },
  {
    label: "Square",
    note: "PWA · 192px",
    clip: "square",
    exportSize: 1024,
    usagePx: 192,
  },
] as const;

function BrandAssets() {
  return (
    <div className="space-y-16 p-10">
      <section>
        <SectionLabel>The Fan</SectionLabel>
        <div className="flex items-center justify-center gap-16">
          <div className="flex flex-col items-center gap-4">
            <LoginAnimation className="size-56" size={224} />
            <Label>Unfold</Label>
          </div>
          <StaticVariant />
        </div>
      </section>

      <section>
        <SectionLabel>Production — paper &amp; ink</SectionLabel>
        <ExportRow variant={PRODUCTION} />
      </section>

      <section>
        <SectionLabel>Staging — ember lines</SectionLabel>
        <ExportRow variant={STAGING} />
      </section>

      <section>
        <SectionLabel>Extension Icons</SectionLabel>
        <div className="flex flex-wrap items-start justify-center gap-10">
          {ICON_SIZES.map((size) => (
            <ExportCard
              key={size}
              label={`${size}px`}
              note="Exported at final size"
              variant={PRODUCTION}
              clip="squircle"
              exportSize={size}
              usagePx={size}
              filename={`${size}.png`}
            />
          ))}
        </div>
      </section>

      <section>
        <SectionLabel>MCP Icon</SectionLabel>
        <div className="flex flex-wrap items-start justify-center gap-10">
          <ExportCard
            label="MCP (512)"
            note="Connector list · 32pt @2x"
            variant={PRODUCTION}
            clip="raycast"
            exportSize={512}
            usagePx={64}
            inset={MCP_INSET}
            filename="cloudstash-mcp-512.png"
          />
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Rounded square with a smaller glyph, matching how Linear, Notion, and
          Cloudflare render theirs in MCP lists.
        </p>
      </section>

      <section>
        <SectionLabel>Chrome Web Store</SectionLabel>
        <div className="flex flex-wrap items-start justify-center gap-10">
          <BannerExport w={440} h={280} label="Small Tile (440×280)" />
          <BannerExport w={1400} h={560} label="Marquee (1400×560)" />
          <BannerExport
            w={1280}
            h={800}
            label="Promo / Screenshot (1280×800)"
          />
        </div>
      </section>
    </div>
  );
}

function ExportRow({ variant }: { variant: FlatVariant }) {
  return (
    <div className="flex flex-wrap items-start justify-center gap-10">
      {ROW_ASSETS.map((asset) => (
        <ExportCard key={asset.label} variant={variant} {...asset} />
      ))}
    </div>
  );
}

function ExportCard({
  label,
  note,
  variant,
  clip,
  exportSize,
  usagePx,
  inset = ICON_INSET,
  filename,
}: {
  label: string;
  note: string;
  variant: FlatVariant;
  clip: ClipType;
  exportSize: number;
  usagePx: number;
  inset?: number;
  filename?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  const handleExport = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    void exportSvgAsPng(
      svg,
      exportSize,
      filename ?? `cloudstash-${variant.name}-${clip}-${exportSize}.png`
    );
  }, [variant, clip, exportSize, filename]);

  return (
    <div className="flex w-44 flex-col items-center gap-3">
      <div className="flex h-48 items-center justify-center">
        <FanTile
          variant={variant}
          clip={clip}
          usagePx={usagePx}
          inset={inset}
          svgRef={svgRef}
        />
      </div>
      <Label>{label}</Label>
      <span className="text-center text-[11px] text-muted-foreground/70">
        {note}
      </span>
      <ExportButton onClick={handleExport} label={label} />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-6 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
      {children}
    </h2>
  );
}

function StaticVariant() {
  return (
    <div className="flex flex-col items-center gap-4">
      <svg
        viewBox="0 0 120 120"
        width={220}
        height={220}
        fill="none"
        className="overflow-visible"
        stroke="currentColor"
        strokeWidth={fanStrokeViewbox(220)}
        strokeLinecap="round"
      >
        {fanSegments(FAN).map((s, i) => (
          <line
            key={i}
            x1={s.x1.toFixed(2)}
            y1={s.y1.toFixed(2)}
            x2={s.x2.toFixed(2)}
            y2={s.y2.toFixed(2)}
          />
        ))}
      </svg>
      <Label>Shape</Label>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

function ExportButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Save ${label} PNG`}
      className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
    >
      Save PNG
    </button>
  );
}

async function exportSvgAsPng(
  svgEl: SVGSVGElement,
  exportSize: number,
  filename: string
) {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(exportSize));
  clone.setAttribute("height", String(exportSize));
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
    type: "image/svg+xml",
  });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const raster = exportSize < 256 ? 4 : 1;
    let canvas = document.createElement("canvas");
    canvas.width = exportSize * raster;
    canvas.height = exportSize * raster;
    canvas
      .getContext("2d")!
      .drawImage(img, 0, 0, exportSize * raster, exportSize * raster);
    if (raster > 1) canvas = scaleCanvasTo(canvas, exportSize, exportSize);
    downloadCanvas(canvas, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img), { once: true });
    img.addEventListener("error", reject, { once: true });
    img.src = src;
  });
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = filename;
  a.click();
}

function scaleCanvasTo(
  src: HTMLCanvasElement,
  w: number,
  h: number
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return out;
}

const ICON_SIZES = [128, 48, 32, 16];

const BANNER_SUBTITLE = "Save links. Read later.";
const BANNER_MUTED = "#71717a";
const BANNER_FONT = "'Noto Sans Variable', sans-serif";

function bannerLayout(w: number, h: number) {
  const fanDia = 0.36 * h;
  const fanVisH = (64 / 120) * fanDia;
  const wordmarkSize = 0.13 * h;
  const subtitleSize = 0.052 * h;
  const gapFan = 0.085 * h;
  const gapSub = 0.075 * h;
  const blockH = fanVisH + gapFan + wordmarkSize + gapSub + subtitleSize;
  const top = (h - blockH) / 2;
  const wordmarkBaseline = top + fanVisH + gapFan + wordmarkSize * 0.78;
  return {
    fanDia,
    centerX: w / 2,
    fanCenterY: top + fanVisH / 2,
    wordmarkSize,
    wordmarkBaseline,
    subtitleSize,
    subtitleBaseline: wordmarkBaseline + gapSub + subtitleSize,
  };
}

function BannerArt({
  w,
  h,
  previewW,
}: {
  w: number;
  h: number;
  previewW: number;
}) {
  const L = bannerLayout(w, h);
  const factor = L.fanDia / 120;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={previewW}
      height={Math.round((h / w) * previewW)}
      style={{ borderRadius: 8, border: `1px solid ${TILE_EDGE}` }}
    >
      <rect width={w} height={h} fill={TILE_BG_TOP} />
      <g
        stroke={PRODUCTION.ink}
        strokeWidth={fanStrokePx(L.fanDia)}
        strokeLinecap="round"
        fill="none"
      >
        {fanSegments(FAN).map((s, i) => (
          <line
            key={i}
            x1={(L.centerX + (s.x1 - 60) * factor).toFixed(2)}
            y1={(L.fanCenterY + (s.y1 - 60) * factor).toFixed(2)}
            x2={(L.centerX + (s.x2 - 60) * factor).toFixed(2)}
            y2={(L.fanCenterY + (s.y2 - 60) * factor).toFixed(2)}
          />
        ))}
      </g>
      <text
        x={L.centerX}
        y={L.wordmarkBaseline}
        textAnchor="middle"
        fill={PRODUCTION.ink}
        fontFamily={BANNER_FONT}
        fontWeight={650}
        fontSize={L.wordmarkSize}
        letterSpacing="-0.01em"
      >
        cloudstash
      </text>
      <text
        x={L.centerX}
        y={L.subtitleBaseline}
        textAnchor="middle"
        fill={BANNER_MUTED}
        fontFamily={BANNER_FONT}
        fontWeight={400}
        fontSize={L.subtitleSize}
      >
        {BANNER_SUBTITLE}
      </text>
    </svg>
  );
}

function drawFanToCtx(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  markDiameter: number,
  strokePx: number,
  ink: string
) {
  const factor = markDiameter / 120;
  ctx.strokeStyle = ink;
  ctx.lineWidth = strokePx;
  ctx.lineCap = "round";
  for (const s of fanSegments(FAN)) {
    ctx.beginPath();
    ctx.moveTo(centerX + (s.x1 - 60) * factor, centerY + (s.y1 - 60) * factor);
    ctx.lineTo(centerX + (s.x2 - 60) * factor, centerY + (s.y2 - 60) * factor);
    ctx.stroke();
  }
}

// Canvas, not SVG rasterization: SVG text through an <img> loses document
// fonts. Renders supersampled; callers downscale to the exact size.
function renderBannerSuper(w: number, h: number): HTMLCanvasElement {
  const S = Math.max(2, Math.ceil(2400 / Math.max(w, h)));
  const canvas = document.createElement("canvas");
  canvas.width = w * S;
  canvas.height = h * S;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(S, S);
  ctx.fillStyle = TILE_BG_TOP;
  ctx.fillRect(0, 0, w, h);

  const L = bannerLayout(w, h);
  drawFanToCtx(
    ctx,
    L.centerX,
    L.fanCenterY,
    L.fanDia,
    fanStrokePx(L.fanDia),
    PRODUCTION.ink
  );

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = PRODUCTION.ink;
  ctx.letterSpacing = `${(-0.01 * L.wordmarkSize).toFixed(2)}px`;
  ctx.font = `650 ${L.wordmarkSize}px ${BANNER_FONT}`;
  ctx.fillText("cloudstash", L.centerX, L.wordmarkBaseline);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = BANNER_MUTED;
  ctx.font = `400 ${L.subtitleSize}px ${BANNER_FONT}`;
  ctx.fillText(BANNER_SUBTITLE, L.centerX, L.subtitleBaseline);

  return canvas;
}

function BannerExport({
  w,
  h,
  label,
}: {
  w: number;
  h: number;
  label: string;
}) {
  const handleExport = useCallback(() => {
    void document.fonts.ready.then(() => {
      downloadCanvas(
        scaleCanvasTo(renderBannerSuper(w, h), w, h),
        `cloudstash-cws-${w}x${h}.png`
      );
    });
  }, [w, h]);

  return (
    <div className="flex flex-col items-center gap-3">
      <BannerArt w={w} h={h} previewW={360} />
      <Label>{label}</Label>
      <ExportButton onClick={handleExport} label={label} />
    </div>
  );
}

const meta = {
  title: "Brand/Generated assets",
  component: BrandAssets,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof BrandAssets>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Gallery: Story = {};

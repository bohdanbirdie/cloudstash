import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  generateDitheredDataUrl,
  PALETTES,
  renderLogoToCanvas,
  STAGING_PALETTE,
} from "@/lib/brand/dither";
import type { DitherPalette } from "@/lib/brand/dither";
import { squirclePath } from "@/lib/brand/squircle";
import { torusKnotPath, torusKnotPoint } from "@/lib/brand/torus-knot";
import type { TorusKnotConfig } from "@/lib/brand/torus-knot";

export const Route = createFileRoute("/_authed/brand")({
  beforeLoad: ({ context }) => {
    // `auth` is guaranteed non-null here — the parent `/_authed` route's
    // `beforeLoad` already redirected anonymous visitors to /login.
    if (context.auth.role !== "admin") throw redirect({ to: "/inbox" });
  },
  component: BrandPage,
});

const ANIMATED_CONFIG: TorusKnotConfig = { R: 16, r: 8, cx: 50, cy: 50 };
const LOGO_CONFIG: TorusKnotConfig = { R: 22, r: 10, cx: 60, cy: 60 };
const SQUIRCLE_D = squirclePath(60, 60, 52, 5);
const LOGO_KNOT_D = torusKnotPath(LOGO_CONFIG);
const STATIC_D = torusKnotPath({ ...ANIMATED_CONFIG, R: 17 });

const MIDNIGHT = PALETTES.find((p) => p.name === "Midnight")!;

const BAYER8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

// Paints the diagonal-gradient Bayer dither (the brand's signature texture)
// across the whole canvas. Shared by the OG and Chrome Web Store renderers.
function fillDither(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  cellSize: number,
  palette: DitherPalette = MIDNIGHT
) {
  const scaledCell = cellSize * (Math.max(W, H) / 256);
  const imgData = ctx.createImageData(W, H);
  const dd = imgData.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = (x + y) / (W + H - 2);
      const bx = Math.floor(x / scaledCell) % 8;
      const by = Math.floor(y / scaledCell) % 8;
      const threshold = (BAYER8[by][bx] + 0.5) / 64;
      const c = t > threshold ? palette.b : palette.a;
      const i = (y * W + x) * 4;
      dd[i] = c.r;
      dd[i + 1] = c.g;
      dd[i + 2] = c.b;
      dd[i + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

function BrandPage() {
  const [cellSize, setCellSize] = useState(3.5);
  const [ogCellSize, setOgCellSize] = useState(1.25);
  const [cwsCellSize, setCwsCellSize] = useState(1.25);
  const [iconStroke, setIconStroke] = useState(3.25);

  return (
    <div className="space-y-16 p-10">
      <section>
        <SectionLabel>Torus Knot (3,4)</SectionLabel>
        <div className="flex items-center justify-center gap-16">
          <AnimatedVariant />
          <StaticVariant />
        </div>
      </section>

      <section>
        <SectionLabel>Color Variants</SectionLabel>
        <div className="flex flex-wrap items-start justify-center gap-10">
          {PALETTES.map((palette) => (
            <LogoVariant
              key={palette.name}
              palette={palette}
              cellSize={cellSize}
            />
          ))}
        </div>
        <CellSizeSlider value={cellSize} onChange={setCellSize} />
      </section>

      <section>
        <SectionLabel>Production — Midnight</SectionLabel>
        <div className="flex flex-wrap items-start justify-center gap-10">
          <ExportVariant
            label="Squircle (1024)"
            cellSize={cellSize}
            size={1024}
            clipType="squircle"
            palette={MIDNIGHT}
          />
          <ExportVariant
            label="Favicon (512)"
            cellSize={cellSize}
            size={512}
            clipType="squircle"
            palette={MIDNIGHT}
          />
          <ExportVariant
            label="Raycast (512)"
            cellSize={cellSize}
            size={512}
            clipType="raycast"
            palette={MIDNIGHT}
          />
          <ExportVariant
            label="Telegram (512)"
            cellSize={cellSize}
            size={512}
            clipType="circle"
            palette={MIDNIGHT}
          />
          <ExportVariant
            label="Square (1024)"
            cellSize={cellSize}
            size={1024}
            clipType="square"
            palette={MIDNIGHT}
          />
        </div>
        <CellSizeSlider value={cellSize} onChange={setCellSize} />
      </section>

      <section>
        <SectionLabel>Staging — Ember</SectionLabel>
        <div className="flex flex-wrap items-start justify-center gap-10">
          <ExportVariant
            label="Squircle (1024)"
            cellSize={cellSize}
            size={1024}
            clipType="squircle"
            palette={STAGING_PALETTE}
          />
          <ExportVariant
            label="Favicon (512)"
            cellSize={cellSize}
            size={512}
            clipType="squircle"
            palette={STAGING_PALETTE}
          />
          <ExportVariant
            label="Raycast (512)"
            cellSize={cellSize}
            size={512}
            clipType="raycast"
            palette={STAGING_PALETTE}
          />
          <ExportVariant
            label="Telegram (512)"
            cellSize={cellSize}
            size={512}
            clipType="circle"
            palette={STAGING_PALETTE}
          />
          <ExportVariant
            label="Square (1024)"
            cellSize={cellSize}
            size={1024}
            clipType="square"
            palette={STAGING_PALETTE}
          />
        </div>
        <CellSizeSlider value={cellSize} onChange={setCellSize} />
      </section>

      <section>
        <SectionLabel>Open Graph — Production</SectionLabel>
        <div className="flex flex-wrap items-start justify-center gap-10">
          <OgPreview cellSize={ogCellSize} />
        </div>
        <CellSizeSlider
          value={ogCellSize}
          onChange={setOgCellSize}
          label="OG Cell Size"
        />
      </section>

      <section>
        <SectionLabel>Extension Icons</SectionLabel>
        <div className="flex flex-wrap items-start justify-center gap-10">
          <IconExport cellSize={cellSize} knotStroke={iconStroke} />
        </div>
        <CellSizeSlider
          value={iconStroke}
          onChange={setIconStroke}
          label="Knot Weight"
        />
      </section>

      <section>
        <SectionLabel>Chrome Web Store</SectionLabel>
        <div className="flex flex-wrap items-start justify-center gap-10">
          <BannerExport
            w={440}
            h={280}
            label="Small Tile (440×280)"
            cellSize={cwsCellSize}
          />
          <BannerExport
            w={1400}
            h={560}
            label="Marquee (1400×560)"
            cellSize={cwsCellSize}
          />
          <BannerExport
            w={1280}
            h={800}
            label="Promo / Screenshot (1280×800)"
            cellSize={cwsCellSize}
          />
        </div>
        <CellSizeSlider
          value={cwsCellSize}
          onChange={setCwsCellSize}
          label="CWS Cell Size"
        />
      </section>
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

function CellSizeSlider({
  value,
  onChange,
  label = "Cell Size",
}: {
  value: number;
  onChange: (v: number) => void;
  label?: string;
}) {
  return (
    <div className="mt-6 flex items-center justify-center gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        type="range"
        aria-label={label}
        min={1}
        max={5}
        step={0.25}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-48"
      />
      <span className="text-xs tabular-nums text-muted-foreground">
        {value}
      </span>
    </div>
  );
}

function AnimatedVariant() {
  const groupRef = useRef<SVGGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const group = groupRef.current!;
    const path = pathRef.current!;
    if (!group || !path) return;

    const NS = "http://www.w3.org/2000/svg";
    const PARTICLE_COUNT = 82;
    const TRAIL_SPAN = 0.24;
    const DURATION_MS = 6200;
    const PULSE_MS = 5200;
    const R_BASE = 16;
    const R_BREATH = 2;

    const circles: SVGCircleElement[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("fill", "currentColor");
      group.appendChild(c);
      circles.push(c);
    }

    const startedAt = performance.now();
    let raf: number;

    function tick(now: number) {
      const time = now - startedAt;
      const progress = (time % DURATION_MS) / DURATION_MS;
      const pulseP = (time % PULSE_MS) / PULSE_MS;
      const s = 0.52 + ((Math.sin(pulseP * Math.PI * 2 + 0.55) + 1) / 2) * 0.48;
      const R = R_BASE + s * R_BREATH;
      const rotation = -((time % 34000) / 34000) * 360;

      group.setAttribute("transform", `rotate(${rotation} 50 50)`);

      let d = "";
      for (let i = 0; i <= 480; i++) {
        const pt = torusKnotPoint(i / 480, { ...ANIMATED_CONFIG, R });
        d += `${i === 0 ? "M" : "L"} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)} `;
      }
      path.setAttribute("d", d + "Z");

      for (let idx = 0; idx < circles.length; idx++) {
        const tailOffset = idx / (PARTICLE_COUNT - 1);
        const p = (((progress - tailOffset * TRAIL_SPAN) % 1) + 1) % 1;
        const pt = torusKnotPoint(p, { ...ANIMATED_CONFIG, R });
        const fade = (1 - tailOffset) ** 0.56;

        circles[idx].setAttribute("cx", pt.x.toFixed(2));
        circles[idx].setAttribute("cy", pt.y.toFixed(2));
        circles[idx].setAttribute("r", (0.9 + fade * 2.7).toFixed(2));
        circles[idx].setAttribute("opacity", (0.04 + fade * 0.96).toFixed(3));
      }

      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      for (const c of circles) c.remove();
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        width={220}
        height={220}
        fill="none"
        className="overflow-visible"
      >
        <g ref={groupRef}>
          <path
            ref={pathRef}
            stroke="currentColor"
            strokeWidth={4.3}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.08}
          />
        </g>
      </svg>
      <Label>Animated</Label>
    </div>
  );
}

function StaticVariant() {
  return (
    <div className="flex flex-col items-center gap-4">
      <svg
        viewBox="0 0 100 100"
        width={220}
        height={220}
        fill="none"
        className="overflow-visible"
      >
        <g transform="rotate(45 50 50)">
          <path
            d={STATIC_D}
            stroke="currentColor"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.9}
          />
        </g>
      </svg>
      <Label>Shape</Label>
    </div>
  );
}

function LogoVariant({
  palette,
  cellSize,
}: {
  palette: DitherPalette;
  cellSize: number;
}) {
  const slug = palette.name.replace(/\s+/g, "-");
  const ditherUrl = useMemo(
    () => generateDitheredDataUrl(cellSize, palette),
    [cellSize, palette]
  );

  const handleExport = useCallback(() => {
    const canvas = renderLogoToCanvas(
      palette,
      cellSize,
      SQUIRCLE_D,
      LOGO_KNOT_D,
      1024
    );
    downloadCanvas(canvas, `cloudstash-${slug}.png`);
  }, [palette, cellSize, slug]);

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        viewBox="0 0 120 120"
        width={180}
        height={180}
        fill="none"
        style={{ imageRendering: "pixelated" }}
      >
        <defs>
          <clipPath id={`sq-${slug}`}>
            <path d={SQUIRCLE_D} />
          </clipPath>
          <radialGradient id={`hl-${slug}`} cx="0.5" cy="0.05" r="0.8">
            <stop offset="0%" stopColor="white" stopOpacity={0.18} />
            <stop offset="50%" stopColor="white" stopOpacity={0.05} />
            <stop offset="100%" stopColor="black" stopOpacity={0} />
          </radialGradient>
          <linearGradient id={`sh-${slug}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="black" stopOpacity={0} />
            <stop offset="70%" stopColor="black" stopOpacity={0} />
            <stop offset="100%" stopColor="black" stopOpacity={0.22} />
          </linearGradient>
        </defs>
        <g clipPath={`url(#sq-${slug})`}>
          <image href={ditherUrl} x={8} y={8} width={104} height={104} />
          <rect
            x={8}
            y={8}
            width={104}
            height={104}
            fill={`url(#hl-${slug})`}
          />
          <rect
            x={8}
            y={8}
            width={104}
            height={104}
            fill={`url(#sh-${slug})`}
          />
        </g>
        <g transform="rotate(45 60 60)">
          <path
            d={LOGO_KNOT_D}
            stroke="#ffffff"
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>
      <Label>{palette.name}</Label>
      <ExportButton onClick={handleExport} label={palette.name} />
    </div>
  );
}

type ClipType = "squircle" | "circle" | "raycast" | "square";

function clipPathForType(type: ClipType, size: number): Path2D {
  if (type === "square") {
    const p = new Path2D();
    p.rect(0, 0, size, size);
    return p;
  }
  if (type === "circle") {
    const p = new Path2D();
    p.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    return p;
  }
  if (type === "raycast") {
    const r = size * 0.22;
    const p = new Path2D();
    p.roundRect(0, 0, size, size, r);
    return p;
  }
  const scale = size / 120;
  const svgD = squirclePath(60, 60, 52, 5);
  const p2 = new Path2D();
  const raw = new Path2D(svgD);
  const m = new DOMMatrix().scale(scale, scale);
  p2.addPath(raw, m);
  return p2;
}

function svgClipForType(type: ClipType): string {
  if (type === "square") {
    return "M 8,8 H 112 V 112 H 8 Z";
  }
  if (type === "circle") {
    return "M 60,8 A 52,52 0 1,1 59.99,8 Z";
  }
  if (type === "raycast") {
    const r = 120 * 0.22 * (52 / 60);
    const x = 8,
      y = 8,
      w = 104,
      h = 104;
    return `M ${x + r},${y} H ${x + w - r} Q ${x + w},${y} ${x + w},${y + r} V ${y + h - r} Q ${x + w},${y + h} ${x + w - r},${y + h} H ${x + r} Q ${x},${y + h} ${x},${y + h - r} V ${y + r} Q ${x},${y} ${x + r},${y} Z`;
  }
  return SQUIRCLE_D;
}

function renderExportCanvas(
  cellSize: number,
  clipType: ClipType,
  exportSize: number,
  palette: DitherPalette = MIDNIGHT,
  knotStroke = 4
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = exportSize;
  canvas.height = exportSize;
  const ctx = canvas.getContext("2d")!;
  const scale = exportSize / 120;

  const ditherCanvas = document.createElement("canvas");
  ditherCanvas.width = exportSize;
  ditherCanvas.height = exportSize;
  const dCtx = ditherCanvas.getContext("2d")!;
  const imgData = dCtx.createImageData(exportSize, exportSize);
  const dd = imgData.data;
  const scaledCell = cellSize * (exportSize / 256);
  for (let y = 0; y < exportSize; y++) {
    for (let x = 0; x < exportSize; x++) {
      const t = (x + y) / (exportSize * 2 - 2);
      const bx = Math.floor(x / scaledCell) % 8;
      const by = Math.floor(y / scaledCell) % 8;
      const threshold = (BAYER8[by][bx] + 0.5) / 64;
      const c = t > threshold ? palette.b : palette.a;
      const i = (y * exportSize + x) * 4;
      dd[i] = c.r;
      dd[i + 1] = c.g;
      dd[i + 2] = c.b;
      dd[i + 3] = 255;
    }
  }
  dCtx.putImageData(imgData, 0, 0);

  ctx.save();
  ctx.clip(clipPathForType(clipType, exportSize));
  ctx.drawImage(ditherCanvas, 0, 0);

  const hlGrad = ctx.createRadialGradient(
    exportSize * 0.5,
    exportSize * 0.05,
    0,
    exportSize * 0.5,
    exportSize * 0.05,
    exportSize * 0.8
  );
  hlGrad.addColorStop(0, "rgba(255, 255, 255, 0.18)");
  hlGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.05)");
  hlGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = hlGrad;
  ctx.fillRect(0, 0, exportSize, exportSize);

  const shGrad = ctx.createLinearGradient(0, 0, 0, exportSize);
  shGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
  shGrad.addColorStop(0.7, "rgba(0, 0, 0, 0)");
  shGrad.addColorStop(1, "rgba(0, 0, 0, 0.22)");
  ctx.fillStyle = shGrad;
  ctx.fillRect(0, 0, exportSize, exportSize);

  const edgeGrad = ctx.createLinearGradient(0, 0, 0, exportSize);
  edgeGrad.addColorStop(0, "rgba(255, 255, 255, 0.12)");
  edgeGrad.addColorStop(0.03, "rgba(255, 255, 255, 0)");
  edgeGrad.addColorStop(0.97, "rgba(0, 0, 0, 0)");
  edgeGrad.addColorStop(1, "rgba(0, 0, 0, 0.15)");
  ctx.fillStyle = edgeGrad;
  ctx.fillRect(0, 0, exportSize, exportSize);

  ctx.restore();

  ctx.save();
  ctx.translate(exportSize / 2, exportSize / 2);
  ctx.rotate((45 * Math.PI) / 180);
  ctx.translate(-exportSize / 2, -exportSize / 2);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = knotStroke * scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const knotConfig: TorusKnotConfig = {
    R: 22,
    r: 10,
    cx: 60 * scale,
    cy: 60 * scale,
  };
  ctx.beginPath();
  for (let i = 0; i <= 500; i++) {
    const pt = torusKnotPoint(i / 500, {
      ...knotConfig,
      R: knotConfig.R * scale,
      r: knotConfig.r * scale,
    });
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  return canvas;
}

function ExportVariant({
  label,
  cellSize,
  size,
  clipType,
  palette = MIDNIGHT,
}: {
  label: string;
  cellSize: number;
  size: number;
  clipType: ClipType;
  palette?: DitherPalette;
}) {
  const slug = palette.name.replace(/\s+/g, "-").toLowerCase();
  const ditherUrl = useMemo(
    () => generateDitheredDataUrl(cellSize, palette),
    [cellSize, palette]
  );
  const svgClip = useMemo(() => svgClipForType(clipType), [clipType]);
  const labelSlug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const clipId = `export-${slug}-${clipType}-${labelSlug}`;

  const handleExport = useCallback(() => {
    const canvas = renderExportCanvas(cellSize, clipType, size, palette);
    downloadCanvas(canvas, `cloudstash-${slug}-${clipType}-${size}.png`);
  }, [cellSize, clipType, size, palette, slug]);

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        viewBox="0 0 120 120"
        width={180}
        height={180}
        fill="none"
        style={{ imageRendering: "pixelated" }}
      >
        <defs>
          <clipPath id={clipId}>
            <path d={svgClip} />
          </clipPath>
          <radialGradient id={`hl-${clipId}`} cx="0.5" cy="0.05" r="0.8">
            <stop offset="0%" stopColor="white" stopOpacity={0.18} />
            <stop offset="50%" stopColor="white" stopOpacity={0.05} />
            <stop offset="100%" stopColor="black" stopOpacity={0} />
          </radialGradient>
          <linearGradient id={`sh-${clipId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="black" stopOpacity={0} />
            <stop offset="70%" stopColor="black" stopOpacity={0} />
            <stop offset="100%" stopColor="black" stopOpacity={0.22} />
          </linearGradient>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <image href={ditherUrl} x={8} y={8} width={104} height={104} />
          <rect
            x={8}
            y={8}
            width={104}
            height={104}
            fill={`url(#hl-${clipId})`}
          />
          <rect
            x={8}
            y={8}
            width={104}
            height={104}
            fill={`url(#sh-${clipId})`}
          />
        </g>
        <g transform="rotate(45 60 60)">
          <path
            d={LOGO_KNOT_D}
            stroke="#ffffff"
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>
      <Label>{label}</Label>
      <ExportButton onClick={handleExport} label={label} />
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

function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = filename;
  a.click();
}

const OG_W = 1200;
const OG_H = 630;

function renderOgCanvas(cellSize: number): HTMLCanvasElement {
  const S = 2;
  const W = OG_W * S;
  const H = OG_H * S;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  fillDither(ctx, W, H, cellSize);

  const fontFamily = "'JetBrains Mono Variable', monospace";
  const knotVisualDiameter = 300 * S;
  const knotMaxR = 32;
  const knotScale = knotVisualDiameter / 2 / knotMaxR;
  const gap = 100 * S;
  const titleSize = Math.round(97 * S);
  const subtitleSize = Math.round(40 * S);

  ctx.font = `700 ${titleSize}px ${fontFamily}`;
  const titleWidth = ctx.measureText("Cloudstash").width;
  ctx.font = `400 ${subtitleSize}px ${fontFamily}`;
  const subtitleWidth = ctx.measureText("Save links. Read later.").width;
  const textBlockWidth = Math.max(titleWidth, subtitleWidth);

  const totalWidth = knotVisualDiameter + gap + textBlockWidth;
  const startX = (W - totalWidth) / 2;
  const knotCx = startX + knotVisualDiameter / 2;
  const knotCy = H / 2;

  ctx.save();
  ctx.translate(knotCx, knotCy);
  ctx.rotate((45 * Math.PI) / 180);
  ctx.translate(-knotCx, -knotCy);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4 * knotScale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i <= 500; i++) {
    const prog = i / 500;
    const tt = prog * Math.PI * 2;
    const rad = 22 + 10 * Math.cos(4 * tt);
    const x = knotCx + rad * knotScale * Math.cos(3 * tt);
    const y = knotCy + rad * knotScale * Math.sin(3 * tt);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  const textX = startX + knotVisualDiameter + gap;
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";

  ctx.font = `700 ${titleSize}px ${fontFamily}`;
  const textYOffset = H * 0.025;
  ctx.fillText("Cloudstash", textX, H / 2 - 32 * S + textYOffset);

  ctx.font = `400 ${subtitleSize}px ${fontFamily}`;
  ctx.fillText("Save links. Read later.", textX, H / 2 + 38 * S + textYOffset);

  const out = document.createElement("canvas");
  out.width = OG_W;
  out.height = OG_H;
  const outCtx = out.getContext("2d")!;
  outCtx.drawImage(canvas, 0, 0, OG_W, OG_H);
  return out;
}

function OgPreview({ cellSize }: { cellSize: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    void document.fonts.ready.then(() => {
      const rendered = renderOgCanvas(cellSize);
      canvas.width = OG_W;
      canvas.height = OG_H;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(rendered, 0, 0);
    });
  }, [cellSize]);

  const handleExport = useCallback(() => {
    void document.fonts.ready.then(() => {
      const rendered = renderOgCanvas(cellSize);
      downloadCanvas(rendered, "cloudstash-og-1200x630.png");
    });
  }, [cellSize]);

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas
        ref={canvasRef}
        style={{
          width: 600,
          height: 315,
          borderRadius: 8,
          imageRendering: "pixelated",
        }}
      />
      <Label>OG Image (1200×630)</Label>
      <ExportButton onClick={handleExport} label="OG Image" />
    </div>
  );
}

const BANNER_SUBTITLE = "Save links. Read later.";

// A wordmark-on-dither banner that auto-fits the knot + text block to any
// aspect ratio, so the same composition reads correctly at every Chrome Web
// Store tile size. Renders to a high-resolution supersampled canvas; callers
// downscale to the exact target size. Supersampling is adaptive so even the
// small 440×280 tile renders from a ~2400px internal canvas — keeping the
// vector text and knot crisp at any output size.
function renderBannerSuper(
  w: number,
  h: number,
  cellSize: number
): HTMLCanvasElement {
  const S = Math.max(2, Math.ceil(2400 / Math.max(w, h)));
  const W = w * S;
  const H = h * S;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  fillDither(ctx, W, H, cellSize);

  const fontFamily = "'JetBrains Mono Variable', monospace";
  let knotDia = 0.476 * H;
  let gap = 0.12 * H;
  let titleSize = 0.154 * H;
  let subtitleSize = 0.0635 * H;

  const measureText = () => {
    ctx.font = `700 ${titleSize}px ${fontFamily}`;
    const tW = ctx.measureText("Cloudstash").width;
    ctx.font = `400 ${subtitleSize}px ${fontFamily}`;
    const sW = ctx.measureText(BANNER_SUBTITLE).width;
    return Math.max(tW, sW);
  };

  let textW = measureText();
  let totalW = knotDia + gap + textW;
  const availW = W * 0.88;
  if (totalW > availW) {
    const fit = availW / totalW;
    knotDia *= fit;
    gap *= fit;
    titleSize *= fit;
    subtitleSize *= fit;
    textW = measureText();
    totalW = knotDia + gap + textW;
  }

  const startX = (W - totalW) / 2;
  const knotCx = startX + knotDia / 2;
  const knotCy = H / 2;
  const knotScale = knotDia / 2 / 32;

  ctx.save();
  ctx.translate(knotCx, knotCy);
  ctx.rotate((45 * Math.PI) / 180);
  ctx.translate(-knotCx, -knotCy);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1, 4 * knotScale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i <= 500; i++) {
    const pt = torusKnotPoint(i / 500, {
      R: 22 * knotScale,
      r: 10 * knotScale,
      cx: knotCx,
      cy: knotCy,
    });
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  const textX = startX + knotDia + gap;
  const gapV = titleSize * 0.35;
  const blockH = titleSize + gapV + subtitleSize;
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${titleSize}px ${fontFamily}`;
  ctx.fillText("Cloudstash", textX, H / 2 - blockH / 2 + titleSize / 2);
  ctx.font = `400 ${subtitleSize}px ${fontFamily}`;
  ctx.fillText(BANNER_SUBTITLE, textX, H / 2 + blockH / 2 - subtitleSize / 2);

  return canvas;
}

// High-quality downscale of the supersampled banner to an exact w×h canvas.
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

function renderBannerCanvas(
  w: number,
  h: number,
  cellSize: number
): HTMLCanvasElement {
  return scaleCanvasTo(renderBannerSuper(w, h, cellSize), w, h);
}

function BannerExport({
  w,
  h,
  label,
  cellSize,
}: {
  w: number;
  h: number;
  label: string;
  cellSize: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewW = 360;
  const previewH = Math.round((h / w) * previewW);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    void document.fonts.ready.then(() => {
      // Draw into a 2× backing store and scale the high-res supersampled
      // render down with smoothing, so the on-screen preview stays sharp.
      const backingW = previewW * 2;
      const backingH = previewH * 2;
      canvas.width = backingW;
      canvas.height = backingH;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        renderBannerSuper(w, h, cellSize),
        0,
        0,
        backingW,
        backingH
      );
    });
  }, [w, h, cellSize, previewH]);

  const handleExport = useCallback(() => {
    void document.fonts.ready.then(() => {
      downloadCanvas(
        renderBannerCanvas(w, h, cellSize),
        `cloudstash-cws-${w}x${h}.png`
      );
    });
  }, [w, h, cellSize]);

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas
        ref={canvasRef}
        style={{
          width: previewW,
          height: previewH,
          borderRadius: 8,
        }}
      />
      <Label>{label}</Label>
      <ExportButton onClick={handleExport} label={label} />
    </div>
  );
}

const ICON_SIZES = [128, 48, 32, 16];

// The Midnight squircle extension icon, with an adjustable knot weight. Each
// size renders at 512 then downscales with smoothing, so even 16px stays clean.
function IconExport({
  cellSize,
  knotStroke,
}: {
  cellSize: number;
  knotStroke: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const src = renderExportCanvas(
      cellSize,
      "squircle",
      256,
      MIDNIGHT,
      knotStroke
    );
    canvas.width = 256;
    canvas.height = 256;
    canvas.getContext("2d")!.drawImage(src, 0, 0);
  }, [cellSize, knotStroke]);

  const exportSize = useCallback(
    (size: number) => {
      const src = renderExportCanvas(
        cellSize,
        "squircle",
        512,
        MIDNIGHT,
        knotStroke
      );
      downloadCanvas(scaleCanvasTo(src, size, size), `${size}.png`);
    },
    [cellSize, knotStroke]
  );

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas
        ref={canvasRef}
        style={{
          width: 128,
          height: 128,
          borderRadius: 24,
          imageRendering: "pixelated",
        }}
      />
      <Label>Extension Icon</Label>
      <div className="flex gap-2">
        {ICON_SIZES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => exportSize(s)}
            aria-label={`Save ${s}px icon PNG`}
            className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            {s}px
          </button>
        ))}
      </div>
    </div>
  );
}

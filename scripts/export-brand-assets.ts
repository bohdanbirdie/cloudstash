// Regenerates the Fan brand PNGs (bun run brand:export). cloudstash-og.png
// is excluded: it renders text, which needs the browser's loaded fonts —
// export it from the "Brand/Open Graph" story instead.

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { initWasm, Resvg } from "@resvg/resvg-wasm";

import {
  FAN,
  FAN_TILE_DY,
  fanSegments,
  fanStrokeViewbox,
} from "../src/lib/brand/fan";
import { CWS_ICON_ARTWORK_RATIO } from "../src/lib/brand/icon-specs";
import { squirclePath } from "../src/lib/brand/squircle";

const INK = "#18181b";
const TILE_BG_TOP = "#ffffff";
const TILE_BG_BOTTOM = "#fafafa";
const TILE_EDGE_TOP = "#efeff2";
const TILE_EDGE_BOTTOM = "#e3e3e8";
const ICON_INSET = 0.62;

type Clip = "squircle" | "square";

const CLIP_PATHS: Record<Clip, string> = {
  squircle: squirclePath(60, 60, 60, 5),
  square: "M 0,0 H 120 V 120 H 0 Z",
};

function tileSvg(clip: Clip, usagePx: number, canvasScale = 1): string {
  const markPx = usagePx * canvasScale * ICON_INSET;
  const rays = fanSegments(FAN)
    .map(
      (s) =>
        `<line x1="${s.x1.toFixed(2)}" y1="${s.y1.toFixed(2)}" x2="${s.x2.toFixed(2)}" y2="${s.y2.toFixed(2)}"/>`
    )
    .join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none">`,
    `<defs>`,
    `<linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="${TILE_BG_TOP}"/>`,
    `<stop offset="0.6" stop-color="${TILE_BG_TOP}"/>`,
    `<stop offset="1" stop-color="${TILE_BG_BOTTOM}"/>`,
    `</linearGradient>`,
    `<linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="${TILE_EDGE_TOP}"/>`,
    `<stop offset="1" stop-color="${TILE_EDGE_BOTTOM}"/>`,
    `</linearGradient>`,
    `</defs>`,
    `<g transform="translate(60 60) scale(${canvasScale}) translate(-60 -60)">`,
    `<path d="${CLIP_PATHS[clip]}" fill="url(#fill)" stroke="url(#edge)" stroke-width="1"/>`,
    `<g transform="translate(60 ${60 + FAN_TILE_DY}) scale(${ICON_INSET}) translate(-60 -60)" stroke="${INK}" stroke-width="${fanStrokeViewbox(markPx)}" stroke-linecap="round">`,
    rays,
    `</g>`,
    `</g>`,
    `</svg>`,
  ].join("");
}

function renderPng(svg: string, sizePx: number): Buffer {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: sizePx } });
  return Buffer.from(resvg.render().asPng());
}

// usagePx keys the stroke rule to the size platforms display the asset at;
// logo512 keys at 192 so the two manifest icons are scaled twins.
const ASSETS: {
  file: string;
  clip: Clip;
  exportSize: number;
  usagePx: number;
}[] = [
  { file: "favicon-16x16.png", clip: "squircle", exportSize: 16, usagePx: 16 },
  { file: "favicon-32x32.png", clip: "squircle", exportSize: 32, usagePx: 32 },
  // Apple touch icons must be opaque and full-bleed; iOS applies the mask.
  {
    file: "apple-touch-icon.png",
    clip: "square",
    exportSize: 180,
    usagePx: 180,
  },
  { file: "logo192.png", clip: "squircle", exportSize: 192, usagePx: 192 },
  { file: "logo512.png", clip: "squircle", exportSize: 512, usagePx: 192 },
];

const publicDir = join(import.meta.dirname, "..", "public");
const wasmPath = join(
  import.meta.dirname,
  "..",
  "node_modules",
  "@resvg",
  "resvg-wasm",
  "index_bg.wasm"
);

await initWasm(await readFile(wasmPath));

for (const asset of ASSETS) {
  const png = renderPng(tileSvg(asset.clip, asset.usagePx), asset.exportSize);
  await writeFile(join(publicDir, asset.file), png);
  console.log(`${asset.file} — ${asset.exportSize}px, ${png.length} bytes`);
}

// favicon.ico is the 32px PNG bytes under the .ico name, as it always was.
const ico = renderPng(tileSvg("squircle", 32), 32);
await writeFile(join(publicDir, "favicon.ico"), ico);
console.log(`favicon.ico — 32px, ${ico.length} bytes`);

const extensionIconDir = join(
  import.meta.dirname,
  "..",
  "apps",
  "extension",
  "public",
  "icon"
);
for (const size of [16, 32, 48, 128]) {
  const png = renderPng(
    tileSvg("squircle", size, CWS_ICON_ARTWORK_RATIO),
    size
  );
  await writeFile(join(extensionIconDir, `${size}.png`), png);
  console.log(`extension icon/${size}.png — ${png.length} bytes`);
}

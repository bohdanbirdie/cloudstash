// Bayer 8x8 ordered dithering

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

export interface DitherColor {
  r: number;
  g: number;
  b: number;
}

export interface DitherPalette {
  name: string;
  a: DitherColor;
  b: DitherColor;
}

export const PALETTES: DitherPalette[] = [
  {
    name: "Deep Ocean",
    a: { r: 0x1d, g: 0x4e, b: 0x89 },
    b: { r: 0x5b, g: 0xa8, b: 0xe0 },
  },
  {
    name: "Twilight",
    a: { r: 0x1a, g: 0x1a, b: 0x5e },
    b: { r: 0x6c, g: 0x7b, b: 0xd4 },
  },
  {
    name: "Midnight",
    a: { r: 0x0a, g: 0x0f, b: 0x2c },
    b: { r: 0x2d, g: 0x5f, b: 0xb8 },
  },
  {
    name: "Storm",
    a: { r: 0x1c, g: 0x2b, b: 0x3a },
    b: { r: 0x4a, g: 0x7c, b: 0x9b },
  },
];

export const STAGING_PALETTE: DitherPalette = {
  name: "Ember",
  a: { r: 0x2c, g: 0x0f, b: 0x0a },
  b: { r: 0xb8, g: 0x5f, b: 0x2d },
};

export function generateDitheredDataUrl(
  cellSize: number,
  palette: DitherPalette,
  size = 256
): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (size * 2 - 2);
      const bx = Math.floor(x / cellSize) % 8;
      const by = Math.floor(y / cellSize) % 8;
      const threshold = (BAYER8[by][bx] + 0.5) / 64;
      const c = t > threshold ? palette.b : palette.a;
      const i = (y * size + x) * 4;
      data[i] = c.r;
      data[i + 1] = c.g;
      data[i + 2] = c.b;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}

export function renderLogoToCanvas(
  palette: DitherPalette,
  cellSize: number,
  squircleSvgPath: string,
  knotSvgPath: string,
  exportSize = 1024
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = exportSize;
  canvas.height = exportSize;
  const ctx = canvas.getContext("2d")!;
  const scale = exportSize / 120;

  // 1. Render dithered background
  const scaledCell = cellSize * (exportSize / 256);
  const imgData = ctx.createImageData(exportSize, exportSize);
  const dd = imgData.data;
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
  ctx.putImageData(imgData, 0, 0);

  // 2. Clip to squircle — draw clipped copy
  const clipped = document.createElement("canvas");
  clipped.width = exportSize;
  clipped.height = exportSize;
  const cCtx = clipped.getContext("2d")!;
  cCtx.save();
  cCtx.scale(scale, scale);
  cCtx.clip(new Path2D(squircleSvgPath));
  cCtx.scale(1 / scale, 1 / scale);
  cCtx.drawImage(canvas, 0, 0);
  cCtx.restore();

  // 3. Draw torus knot
  cCtx.save();
  cCtx.translate(exportSize / 2, exportSize / 2);
  cCtx.rotate((45 * Math.PI) / 180);
  cCtx.translate(-exportSize / 2, -exportSize / 2);
  cCtx.strokeStyle = "#ffffff";
  cCtx.lineWidth = 4 * scale;
  cCtx.lineCap = "round";
  cCtx.lineJoin = "round";
  cCtx.stroke(new Path2D(knotSvgPath));
  cCtx.restore();

  return clipped;
}

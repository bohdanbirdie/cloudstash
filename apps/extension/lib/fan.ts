// Mirror of src/lib/brand/fan.ts — the extension stays self-contained.

export const FAN = {
  rays: 9,
  spreadDeg: 150,
  innerR: 23,
  outerR: 70,
  cx: 60,
  cy: 98,
};

export const FAN_VIEWBOX = "0 0 120 120";

export interface FanSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function fanSegments(): FanSegment[] {
  const half = (FAN.spreadDeg / 2) * (Math.PI / 180);
  const mid = -Math.PI / 2;
  return Array.from({ length: FAN.rays }, (_, i) => {
    const angle = mid - half + (i / (FAN.rays - 1)) * 2 * half;
    return {
      x1: FAN.cx + FAN.innerR * Math.cos(angle),
      y1: FAN.cy + FAN.innerR * Math.sin(angle),
      x2: FAN.cx + FAN.outerR * Math.cos(angle),
      y2: FAN.cy + FAN.outerR * Math.sin(angle),
    };
  });
}

export function fanStrokePx(sizePx: number): number {
  if (sizePx >= 96) return 0.7;
  return 0.7 * (sizePx / 96) ** 0.35;
}

export function fanStrokeViewbox(sizePx: number): number {
  return (fanStrokePx(sizePx) * 120) / sizePx;
}

// The Fan — Cloudstash's logo mark. Brand contract:
// context/01-product/spec.md, "Brand Identity".

export interface FanConfig {
  rays: number;
  spreadDeg: number;
  innerR: number;
  outerR: number;
  cx: number;
  cy: number;
}

export const FAN: FanConfig = {
  rays: 9,
  spreadDeg: 150,
  innerR: 23,
  outerR: 70,
  cx: 60,
  cy: 98,
};

export const FAN_VIEWBOX = "0 0 120 120";
export const FAN_BASE_STROKE = 0.7;
export const FAN_DOT_RADIUS = 1.6;

export interface FanSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function fanAngles(config: FanConfig = FAN): number[] {
  const half = (config.spreadDeg / 2) * (Math.PI / 180);
  const mid = -Math.PI / 2;
  if (config.rays === 1) return [mid];
  return Array.from(
    { length: config.rays },
    (_, i) => mid - half + (i / (config.rays - 1)) * 2 * half
  );
}

export function fanSegmentAt(
  angle: number,
  config: FanConfig = FAN
): FanSegment {
  return {
    x1: config.cx + config.innerR * Math.cos(angle),
    y1: config.cy + config.innerR * Math.sin(angle),
    x2: config.cx + config.outerR * Math.cos(angle),
    y2: config.cy + config.outerR * Math.sin(angle),
  };
}

export function fanSegments(config: FanConfig = FAN): FanSegment[] {
  return fanAngles(config).map((a) => fanSegmentAt(a, config));
}

const FAN_CENTROID_Y =
  fanSegments(FAN).reduce((sum, s) => sum + (s.y1 + s.y2) / 2, 0) / FAN.rays;
const VIEWBOX_CENTER_Y = 60;
export const FAN_TILE_DY = VIEWBOX_CENTER_Y - FAN_CENTROID_Y;

const STROKE_REFERENCE_PX = 96;
const STROKE_TAPER_EXPONENT = 0.35;

export function fanStrokePx(sizePx: number): number {
  if (sizePx >= STROKE_REFERENCE_PX) return FAN_BASE_STROKE;
  return (
    FAN_BASE_STROKE * (sizePx / STROKE_REFERENCE_PX) ** STROKE_TAPER_EXPONENT
  );
}

export function fanStrokeViewbox(sizePx: number): number {
  return (fanStrokePx(sizePx) * 120) / sizePx;
}

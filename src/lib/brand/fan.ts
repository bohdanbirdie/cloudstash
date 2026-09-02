// The Fan — Cloudstash's logo mark.
// Nine hairline rays, symmetric about vertical, fanned 150° from a pivot
// below the canvas center. Rays never touch the pivot. The ray count never
// changes: every render, at every size, is the same nine-ray mark.

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

// Optical centering: tiles center the fan on its stroke centroid (the
// mark's center of mass) rather than its bounding-box center. The rays
// converge low, so box-centering reads low. Derived from geometry, not
// hand-tuned: 60 minus the mean segment-midpoint y, ≈ −6.4 viewBox units.
const FAN_CENTROID_Y =
  fanSegments(FAN).reduce((sum, s) => sum + (s.y1 + s.y2) / 2, 0) / FAN.rays;
export const FAN_TILE_DY = 60 - FAN_CENTROID_Y;

// The stroke rule: 0.7 CSS px at 96px and above; below that the stroke
// scales DOWN with the mark, as 0.7 × (size / 96)^0.35 — sublinear, so it
// thins slower than the mark shrinks. A 20px mark gets ~0.42px, visibly
// finer than a 79px mark's ~0.65px, while anti-aliasing keeps it readable.
export function fanStrokePx(sizePx: number): number {
  if (sizePx >= 96) return FAN_BASE_STROKE;
  return FAN_BASE_STROKE * (sizePx / 96) ** 0.35;
}

// The same rule expressed in viewBox units for a 120-unit canvas rendered
// at sizePx — what an SVG strokeWidth attribute needs.
export function fanStrokeViewbox(sizePx: number): number {
  return (fanStrokePx(sizePx) * 120) / sizePx;
}

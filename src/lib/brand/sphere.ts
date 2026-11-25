/**
 * The Cloudstash logo: a ball of evenly spread dots, tilted and lit from the top left.
 * The same drawing as apps/native/scripts/brand.py and apps/native/src/sphere.rs.
 */
const TURN = 2.399_96;
export const SPHERE_TILT = 0.5;
const LIGHT = [-0.42, -0.62, 0.66] as const;

export interface SphereDot {
  /** Position on the unit ball's face, -1 to 1. */
  x: number;
  y: number;
  /** Radius, as a share of the dot's base size. */
  size: number;
  opacity: number;
}

/**
 * The dots on the front of the ball once it has turned `yaw` radians. A still logo cuts them
 * off at the edge; with `fade`, for a turning one, they fade in and out there instead.
 */
export function sphereDots(
  count: number,
  floor: number,
  yaw = 0,
  fade = false,
  tilt = SPHERE_TILT
): SphereDot[] {
  const dots: SphereDot[] = [];
  for (let i = 0; i < count; i++) {
    const y0 = 1 - (2 * (i + 0.5)) / count;
    const ring = Math.sqrt(1 - y0 * y0);
    const x = ring * Math.cos(i * TURN + yaw);
    const z0 = ring * Math.sin(i * TURN + yaw);
    const y = y0 * Math.cos(tilt) - z0 * Math.sin(tilt);
    const z = y0 * Math.sin(tilt) + z0 * Math.cos(tilt);
    if (z < (fade ? 0.02 : 0.04)) continue;
    const edge = Math.min(1, Math.max(0, (z - 0.02) / 0.23));
    const front = fade ? edge * edge * (3 - 2 * edge) : 1;
    const lit = Math.max(0, x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2]);
    dots.push({
      x,
      y,
      size: 0.3 + 0.7 * z,
      opacity: front * (floor + (1 - floor) * lit ** 1.15),
    });
  }
  return dots;
}

/** The full logo, and a cut with fewer, bigger dots that survives small sizes. */
export const SPHERE_FINE = { count: 150, base: 5.83, floor: 0.1 } as const;
export const SPHERE_SMALL = { count: 44, base: 10.5, floor: 0.3 } as const;

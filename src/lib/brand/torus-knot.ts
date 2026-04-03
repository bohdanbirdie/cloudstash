// Torus Knot (3,4)
// x(t) = (R + r·cos(4t))·cos(3t)
// y(t) = (R + r·cos(4t))·sin(3t)

const P = 3;
const Q = 4;

export interface TorusKnotConfig {
  R: number;
  r: number;
  cx: number;
  cy: number;
}

export function torusKnotPoint(
  progress: number,
  config: TorusKnotConfig
): { x: number; y: number } {
  const t = progress * Math.PI * 2;
  const rad = config.R + config.r * Math.cos(Q * t);
  return {
    x: config.cx + rad * Math.cos(P * t),
    y: config.cy + rad * Math.sin(P * t),
  };
}

export function torusKnotPath(config: TorusKnotConfig, steps = 500): string {
  const parts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const pt = torusKnotPoint(i / steps, config);
    parts.push(`${i === 0 ? "M" : "L"} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`);
  }
  return parts.join(" ") + " Z";
}

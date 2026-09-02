// Motion math for the Fan mark. appEase matches the curve src/styles.css
// uses, so brand animation and UI transitions share one gesture.

import { fanAngles } from "@/lib/brand/fan";
import type { FanConfig } from "@/lib/brand/fan";

export function cubicBezierEase(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number
): (x: number) => number {
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;
  return (x) => {
    let u = x;
    for (let i = 0; i < 6; i++) {
      const xt = ((ax * u + bx) * u + cx) * u - x;
      const dx = (3 * ax * u + 2 * bx) * u + cx;
      if (Math.abs(dx) < 1e-6) break;
      u -= xt / dx;
    }
    return ((ay * u + by) * u + cy) * u;
  };
}

export const appEase = cubicBezierEase(0.16, 1, 0.3, 1);

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export const easeSeg = (t: number, start: number, dur: number) =>
  appEase(clamp01((t - start) / dur));

const UNFOLD_CYCLE_S = 4.4;

// The idle loop: bloom open (Unfold), rays leave through their tips and
// redraw from the center (Trace), fold shut, repeat. Phases hand over only
// while the mark is fully open or fully hidden, so no seam is visible.
export const FAN_LOOP_CYCLE_S = 5.4;

const LOOP = {
  bloomStart: 0.25,
  bloomStagger: 0.16,
  bloomDur: 0.55,
  traceOutStart: 2.3,
  traceOutDur: 0.45,
  redrawStart: 2.95,
  redrawStagger: 0.13,
  redrawDur: 0.5,
  foldStart: 4.6,
  foldDur: 0.5,
};

export interface FanLoopRay {
  angle: number;
  dashOffset: number;
}

export function fanLoopFrame(ts: number, config: FanConfig): FanLoopRay[] {
  const t = ts % FAN_LOOP_CYCLE_S;
  const mid = -Math.PI / 2;
  const len = config.outerR - config.innerR;
  const fold = easeSeg(t, LOOP.foldStart, LOOP.foldDur);
  return fanAngles(config).map((a, i) => {
    const pair = Math.abs(i - (config.rays - 1) / 2);
    const open = easeSeg(
      t,
      LOOP.bloomStart + pair * LOOP.bloomStagger,
      LOOP.bloomDur
    );
    const opened = mid + (a - mid) * open;
    const angle = opened + (mid - opened) * fold;

    const redrawStart = LOOP.redrawStart + pair * LOOP.redrawStagger;
    let dashOffset = 0;
    if (t >= redrawStart) {
      dashOffset = len * (1 - easeSeg(t, redrawStart, LOOP.redrawDur));
    } else if (t >= LOOP.traceOutStart) {
      dashOffset = -len * easeSeg(t, LOOP.traceOutStart, LOOP.traceOutDur);
    }
    return { angle, dashOffset };
  });
}

export function unfoldAngles(ts: number, config: FanConfig): number[] {
  const t = ts % UNFOLD_CYCLE_S;
  const mid = -Math.PI / 2;
  const refold = easeSeg(t, 3.5, 0.5);
  return fanAngles(config).map((a, i) => {
    const pair = Math.abs(i - (config.rays - 1) / 2);
    const open = easeSeg(t, 0.25 + pair * 0.16, 0.55);
    const current = mid + (a - mid) * open;
    return current + (mid - current) * refold;
  });
}

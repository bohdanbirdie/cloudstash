// Motion math for the Fan mark. All loops run on the app's own motion curve
// (cubic-bezier(0.16, 1, 0.3, 1) — the one src/styles.css uses) so brand
// animation and UI transitions share one gesture.

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

// Eased progress of a sub-phase: 0 before `start`, 1 after `start + dur`.
export const easeSeg = (t: number, start: number, dur: number) =>
  appEase(clamp01((t - start) / dur));

const UNFOLD_CYCLE_S = 4.4;

// The idle loop chains Unfold and Trace into one continuous cycle:
// bloom open pair by pair (Unfold), rest, rays leave through their own
// tips (Trace out), redraw from the center outward (Trace in), rest,
// fold shut, repeat. Angles and dash offsets always hand over while the
// mark is either fully open or fully hidden, so no phase seam is visible.
export const FAN_LOOP_CYCLE_S = 5.4;

export interface FanLoopRay {
  angle: number;
  dashOffset: number;
}

export function fanLoopFrame(ts: number, config: FanConfig): FanLoopRay[] {
  const t = ts % FAN_LOOP_CYCLE_S;
  const mid = -Math.PI / 2;
  const len = config.outerR - config.innerR;
  const fold = easeSeg(t, 4.6, 0.5);
  return fanAngles(config).map((a, i) => {
    const pair = Math.abs(i - (config.rays - 1) / 2);
    const open = easeSeg(t, 0.25 + pair * 0.16, 0.55);
    const opened = mid + (a - mid) * open;
    const angle = opened + (mid - opened) * fold;

    const redrawStart = 2.95 + pair * 0.13;
    let dashOffset = 0;
    if (t >= redrawStart) {
      dashOffset = len * (1 - easeSeg(t, redrawStart, 0.5));
    } else if (t >= 2.3) {
      dashOffset = -len * easeSeg(t, 2.3, 0.45);
    }
    return { angle, dashOffset };
  });
}

// Unfold — the page-loading loop. The mark blooms from a single vertical
// line, pair by pair from the center outward, rests open, folds shut, and
// repeats. Returns the ray angles for time `ts` (seconds).
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

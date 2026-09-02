import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef } from "react";

import {
  FAN,
  FAN_DOT_RADIUS,
  FAN_VIEWBOX,
  fanAngles,
  fanSegmentAt,
  fanStrokeViewbox,
} from "@/lib/brand/fan";
import {
  appEase,
  clamp01,
  easeSeg,
  unfoldAngles,
} from "@/lib/brand/fan-motion";

// Every motion study from the identity exploration, preserved. Each card is
// a self-contained loop over the same nine hairlines; the "use" tag names
// the app moment the loop was designed for.

const N = FAN.rays;
const CENTER = (N - 1) / 2;
const STROKE = fanStrokeViewbox(180);
const f = (n: number) => n.toFixed(2);

function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  extra = ""
): string {
  return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"${extra}/>`;
}

function rayAt(angle: number, extra = ""): string {
  const s = fanSegmentAt(angle, FAN);
  return line(s.x1, s.y1, s.x2, s.y2, extra);
}

function staticFan(): string {
  return fanAngles(FAN)
    .map((a) => rayAt(a))
    .join("");
}

interface MotionIdea {
  name: string;
  use: string;
  note: string;
  render: (ts: number) => string;
}

const IDEAS: MotionIdea[] = [
  {
    name: "Fold",
    use: "hover",
    note: "The fan closes onto its leading edge like a real hand fan, rests a beat, and reopens.",
    render(ts) {
      const t = ts % 3.8;
      const k = easeSeg(t, 1.0, 0.7) - easeSeg(t, 2.4, 0.7);
      const angles = fanAngles(FAN);
      const lead = angles[0];
      return angles.map((a) => rayAt(a + (lead - a) * k)).join("");
    },
  },
  {
    name: "Unfold",
    use: "intro / loading",
    note: "Blooms from a single vertical line, pair by pair from the center outward. Shipped as the loading state.",
    render(ts) {
      return unfoldAngles(ts, FAN)
        .map((a) => rayAt(a))
        .join("");
    },
  },
  {
    name: "Breeze",
    use: "ambient",
    note: "A wave of wind passes through the ribs — the center barely moves, the edges sway.",
    render(ts) {
      return fanAngles(FAN)
        .map((a, i) => {
          const edge = Math.abs(i - CENTER) / CENTER;
          return rayAt(
            a + 0.02 * Math.sin(ts * 1.7 - i * 0.55) * (0.3 + 0.7 * edge)
          );
        })
        .join("");
    },
  },
  {
    name: "Trace",
    use: "loading (alt)",
    note: "Rays draw themselves from the center out, hold as the full mark, then leave through their own tips.",
    render(ts) {
      const t = ts % 3.4;
      const v = easeSeg(t, 2.5, 0.45);
      const len = FAN.outerR - FAN.innerR;
      return fanAngles(FAN)
        .map((a, i) => {
          const pair = Math.abs(i - CENTER);
          const g = easeSeg(t, 0.15 + pair * 0.13, 0.5);
          const off = len * (1 - g) - len * v;
          return rayAt(
            a,
            ` stroke-dasharray="${f(len)}" stroke-dashoffset="${f(off)}"`
          );
        })
        .join("");
    },
  },
  {
    name: "Glint",
    use: "ai at work",
    note: "A soft brightness travels across the ribs, left to right, and fades out before repeating.",
    render(ts) {
      const t = ts % 3.0;
      const pos = -0.25 + (t / 3.0) * 1.5;
      return fanAngles(FAN)
        .map((a, i) => {
          const xi = i / (N - 1);
          const op = 0.45 + 0.55 * Math.exp(-(((xi - pos) / 0.12) ** 2));
          return rayAt(a, ` opacity="${op.toFixed(3)}"`);
        })
        .join("");
    },
  },
  {
    name: "Spark",
    use: "saved",
    note: "One bright bead leaves the pivot and rides every rib to its tip at once — the save confirmation.",
    render(ts) {
      const t = ts % 2.6;
      const p = easeSeg(t, 0.5, 0.8);
      const len = FAN.outerR - FAN.innerR;
      let s = staticFan();
      if (p > 0 && p < 1) {
        s += fanAngles(FAN)
          .map((a) =>
            rayAt(
              a,
              ` stroke-width="${f(STROKE * 2.4)}" stroke-dasharray="7 ${f(len)}" stroke-dashoffset="${f(7 - (len + 14) * p)}"`
            )
          )
          .join("");
      }
      return s;
    },
  },
  {
    name: "Tide",
    use: "landing hero",
    note: "The tips breathe in a slow traveling wave — the rib lengths swell and recede like water.",
    render(ts) {
      return fanAngles(FAN)
        .map((a, i) => {
          const outer = FAN.outerR + 3.5 * Math.sin(ts * 1.9 - i * 0.7);
          return line(
            FAN.cx + FAN.innerR * Math.cos(a),
            FAN.cy + FAN.innerR * Math.sin(a),
            FAN.cx + outer * Math.cos(a),
            FAN.cy + outer * Math.sin(a)
          );
        })
        .join("");
    },
  },
  {
    name: "Count",
    use: "import",
    note: "Ribs light up one by one, left to right, like a tally being kept — then rest as the full mark.",
    render(ts) {
      const t = ts % 3.8;
      const off = easeSeg(t, 3.2, 0.4);
      return fanAngles(FAN)
        .map((a, i) => {
          const lit = easeSeg(t, 0.2 + i * 0.17, 0.25);
          const op = 0.22 + 0.78 * lit * (1 - off);
          return rayAt(a, ` opacity="${op.toFixed(3)}"`);
        })
        .join("");
    },
  },
  {
    name: "Pulse",
    use: "notification",
    note: "A quiet double heartbeat — the whole fan swells twice from its pivot and settles.",
    render(ts) {
      const t = ts % 2.9;
      const beat = (x: number) => Math.exp(-((x / 0.09) ** 2));
      const scale = 1 + 0.04 * (beat(t - 0.5) + beat(t - 0.82));
      return fanAngles(FAN)
        .map((a) =>
          line(
            FAN.cx + FAN.innerR * scale * Math.cos(a),
            FAN.cy + FAN.innerR * scale * Math.sin(a),
            FAN.cx + FAN.outerR * scale * Math.cos(a),
            FAN.cy + FAN.outerR * scale * Math.sin(a)
          )
        )
        .join("");
    },
  },
  {
    name: "Gather",
    use: "sync",
    note: "A wave runs along the inner edge — each rib's root dips toward the pivot and returns, like the mark inhaling.",
    render(ts) {
      const t = ts % 2.8;
      const pos = -0.2 + (t / 2.8) * 1.4;
      return fanAngles(FAN)
        .map((a, i) => {
          const xi = i / (N - 1);
          const dip = 6 * Math.exp(-(((xi - pos) / 0.14) ** 2));
          return line(
            FAN.cx + (FAN.innerR - dip) * Math.cos(a),
            FAN.cy + (FAN.innerR - dip) * Math.sin(a),
            FAN.cx + FAN.outerR * Math.cos(a),
            FAN.cy + FAN.outerR * Math.sin(a)
          );
        })
        .join("");
    },
  },
  {
    name: "Morph",
    use: "landing demo",
    note: "The fan bends and grows into the Drop: lines gather, a single stem draws down from the center tip, and the dot buds at its end. Real control-point interpolation, no fades.",
    render: morphRender,
  },
];

// ---- Fan → Drop morph ----

type Cubic = [number, number][];

function fanCubics(): Cubic[] {
  return fanAngles(FAN).map((a) => {
    const s = fanSegmentAt(a, FAN);
    const p0: [number, number] = [s.x1, s.y1];
    const p3: [number, number] = [s.x2, s.y2];
    return [
      p0,
      [p0[0] + (p3[0] - p0[0]) / 3, p0[1] + (p3[1] - p0[1]) / 3],
      [p0[0] + (p3[0] - p0[0]) * (2 / 3), p0[1] + (p3[1] - p0[1]) * (2 / 3)],
      p3,
    ];
  });
}

function dropCubics(): Cubic[] {
  return Array.from({ length: N }, (_, i) => {
    const x = 24 + (72 * i) / (N - 1);
    return [
      [60, 68],
      [60 + (x - 60) * 0.2, 52],
      [x, 40],
      [x, 20],
    ];
  });
}

const cubicD = (c: Cubic) =>
  `M ${f(c[0][0])} ${f(c[0][1])} C ${f(c[1][0])} ${f(c[1][1])} ${f(c[2][0])} ${f(c[2][1])} ${f(c[3][0])} ${f(c[3][1])}`;

const MORPH_CYCLE_S = 3.4;

function morphRender(ts: number): string {
  const cycle = ts % MORPH_CYCLE_S;
  // forward, hold, reverse, hold
  const phase = cycle / MORPH_CYCLE_S;
  let t: number;
  let dir: 1 | -1;
  if (phase < 0.35) {
    t = phase / 0.35;
    dir = 1;
  } else if (phase < 0.5) {
    t = 1;
    dir = 1;
  } else if (phase < 0.85) {
    t = 1 - (phase - 0.5) / 0.35;
    dir = -1;
  } else {
    t = 0;
    dir = -1;
  }

  const A = fanCubics();
  const B = dropCubics();
  const ti = dir === 1 ? appEase(t) : 1 - appEase(1 - t);
  const flex = Math.sin(Math.PI * clamp01(ti));
  const tailT0 =
    dir === 1 ? clamp01((t - 0.2) / 0.36) : clamp01((t - 0.75) / 0.25);
  const tailT = tailT0 * tailT0 * (3 - 2 * tailT0);

  let tipX = 60;
  let tipY = 68;
  let inner = "";
  for (let i = 0; i < N; i++) {
    const c: Cubic = A[i].map((p, k) => [
      p[0] + (B[i][k][0] - p[0]) * ti,
      p[1] + (B[i][k][1] - p[1]) * ti,
    ]);
    const dx = c[3][0] - c[0][0];
    const dy = c[3][1] - c[0][1];
    const len = Math.hypot(dx, dy) || 1;
    let px = -dy / len;
    let py = dx / len;
    const midx = (c[0][0] + c[3][0]) / 2;
    if (px * (midx - 60) < 0) {
      px = -px;
      py = -py;
    }
    const edge = Math.abs(i - CENTER) / CENTER;
    const amp = flex * 3.2 * edge;
    c[1][0] += px * amp;
    c[1][1] += py * amp;
    c[2][0] += px * amp;
    c[2][1] += py * amp;
    if (i === CENTER) {
      tipX = c[0][0];
      tipY = c[0][1];
    }
    inner += `<path d="${cubicD(c)}"/>`;
  }
  if (tailT > 0) {
    const endY = tipY + 20 * tailT;
    inner += `<path d="M ${f(tipX)} ${f(tipY)} L ${f(tipX)} ${f(endY)}"/>`;
    inner += `<circle cx="${f(tipX)}" cy="${f(endY)}" r="${f(FAN_DOT_RADIUS * tailT)}" fill="currentColor" stroke="none"/>`;
  }
  return inner;
}

// ---- gallery ----

function MotionCard({ idea }: { idea: MotionIdea }) {
  const groupRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      group.innerHTML = staticFan();
      return;
    }
    const startedAt = performance.now();
    let raf: number;
    function tick(now: number) {
      group!.innerHTML = idea.render((now - startedAt) / 1000);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [idea]);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="grid place-items-center rounded-md bg-muted/40 px-2 py-5">
        <svg
          viewBox={FAN_VIEWBOX}
          width={180}
          height={160}
          fill="none"
          className="overflow-visible"
        >
          <g
            ref={groupRef}
            stroke="currentColor"
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="flex items-baseline gap-2.5">
        <h3 className="text-sm font-semibold tracking-tight">{idea.name}</h3>
        <span className="text-[10px] font-medium uppercase tracking-widest text-primary">
          {idea.use}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {idea.note}
      </p>
    </div>
  );
}

function FanMotionGallery() {
  return (
    <div className="p-10">
      <p className="mx-auto mb-8 max-w-xl text-center text-sm text-muted-foreground">
        The full motion vocabulary of the Fan mark. Unfold ships as the loading
        state; the rest are preserved here for future moments.
      </p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
        {IDEAS.map((idea) => (
          <MotionCard key={idea.name} idea={idea} />
        ))}
      </div>
    </div>
  );
}

const meta = {
  title: "Brand/Fan motion",
  component: FanMotionGallery,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof FanMotionGallery>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Gallery: Story = {};

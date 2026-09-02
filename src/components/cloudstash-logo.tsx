import { useId } from "react";

import {
  FAN,
  FAN_TILE_DY,
  FAN_VIEWBOX,
  fanSegments,
  fanStrokeViewbox,
} from "@/lib/brand/fan";
import { squirclePath } from "@/lib/brand/squircle";

const SQUIRCLE_D = squirclePath(60, 60, 52, 5);
// Depth is two stacked cues, both whispers: the fill stays pure white
// through the top half and only shades in the last stretch, and the rim is
// lit from above (lighter at top, denser at bottom). No overall gray wash.
const TILE_BG_TOP = "#ffffff";
const TILE_BG_BOTTOM = "#fafafa";
const TILE_EDGE_TOP = "#efeff2";
const TILE_EDGE_BOTTOM = "#e3e3e8";
const TILE_INK = "#18181b";

// `size` is the intended render size in CSS px. It picks the cut (5 rays
// under 40px, 9 above) and the stroke weight per the brand stroke rule.
export function CloudstashLogo({
  className,
  variant = "plain",
  size = 24,
}: {
  className?: string;
  variant?: "plain" | "branded";
  size?: number;
}) {
  if (variant === "branded") {
    return <BrandedLogo className={className} size={size} />;
  }

  return (
    <svg
      viewBox={FAN_VIEWBOX}
      fill="none"
      className={className}
      style={{ overflow: "visible" }}
      aria-hidden="true"
    >
      <FanMark size={size} stroke="currentColor" />
    </svg>
  );
}

function FanMark({ size, stroke }: { size: number; stroke: string }) {
  return (
    <g
      stroke={stroke}
      strokeWidth={fanStrokeViewbox(size)}
      strokeLinecap="round"
    >
      {fanSegments(FAN).map((s, i) => (
        <line
          key={i}
          x1={s.x1.toFixed(2)}
          y1={s.y1.toFixed(2)}
          x2={s.x2.toFixed(2)}
          y2={s.y2.toFixed(2)}
        />
      ))}
    </g>
  );
}

function BrandedLogo({
  className,
  size,
}: {
  className?: string;
  size: number;
}) {
  const baseId = useId().replace(/:/g, "");
  const fillId = `${baseId}-fill`;
  const edgeId = `${baseId}-edge`;
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={TILE_BG_TOP} />
          <stop offset="0.6" stopColor={TILE_BG_TOP} />
          <stop offset="1" stopColor={TILE_BG_BOTTOM} />
        </linearGradient>
        <linearGradient id={edgeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={TILE_EDGE_TOP} />
          <stop offset="1" stopColor={TILE_EDGE_BOTTOM} />
        </linearGradient>
      </defs>
      <path
        d={SQUIRCLE_D}
        fill={`url(#${fillId})`}
        stroke={`url(#${edgeId})`}
        strokeWidth={2}
      />
      <g
        transform={`translate(60 ${60 + FAN_TILE_DY}) scale(0.62) translate(-60 -60)`}
      >
        <FanMark size={size * 0.62} stroke={TILE_INK} />
      </g>
    </svg>
  );
}

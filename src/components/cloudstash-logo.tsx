import { useMemo } from "react";

import { generateDitheredDataUrl, PALETTES } from "@/lib/brand/dither";
import { squirclePath } from "@/lib/brand/squircle";
import { torusKnotPath } from "@/lib/brand/torus-knot";

const KNOT_D = torusKnotPath({ R: 22, r: 10, cx: 60, cy: 60 });
const SQUIRCLE_D = squirclePath(60, 60, 52, 5);
const MIDNIGHT = PALETTES.find((p) => p.name === "Midnight")!;

export function CloudstashLogo({
  className,
  variant = "plain",
}: {
  className?: string;
  variant?: "plain" | "branded";
}) {
  if (variant === "branded") {
    return <BrandedLogo className={className} />;
  }

  return (
    <svg
      viewBox="22 22 76 76"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <g transform="rotate(45 60 60)">
        <path
          d={KNOT_D}
          stroke="currentColor"
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

function BrandedLogo({ className }: { className?: string }) {
  const ditherUrl = useMemo(() => generateDitheredDataUrl(3.5, MIDNIGHT), []);

  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      className={className}
      style={{ imageRendering: "pixelated" }}
      aria-hidden="true"
    >
      <defs>
        <clipPath id="sidebar-sq">
          <path d={SQUIRCLE_D} />
        </clipPath>
        <radialGradient id="sidebar-hl" cx="0.5" cy="0.05" r="0.8">
          <stop offset="0%" stopColor="white" stopOpacity={0.18} />
          <stop offset="50%" stopColor="white" stopOpacity={0.05} />
          <stop offset="100%" stopColor="black" stopOpacity={0} />
        </radialGradient>
        <linearGradient id="sidebar-sh" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="black" stopOpacity={0} />
          <stop offset="70%" stopColor="black" stopOpacity={0} />
          <stop offset="100%" stopColor="black" stopOpacity={0.22} />
        </linearGradient>
      </defs>
      <g clipPath="url(#sidebar-sq)">
        <image href={ditherUrl} x={8} y={8} width={104} height={104} />
        <rect x={8} y={8} width={104} height={104} fill="url(#sidebar-hl)" />
        <rect x={8} y={8} width={104} height={104} fill="url(#sidebar-sh)" />
      </g>
      <g transform="rotate(45 60 60)">
        <path
          d={KNOT_D}
          stroke="#ffffff"
          strokeWidth={5.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

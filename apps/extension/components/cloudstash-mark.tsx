import { torusKnotPath } from "../lib/torus-knot";

const KNOT_D = torusKnotPath({ R: 22, r: 10, cx: 60, cy: 60 });

export function CloudstashMark({ className }: { className?: string }) {
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
          strokeWidth={4.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

import { FAN_VIEWBOX, fanSegments, fanStrokeViewbox } from "../lib/fan";

export function CloudstashMark({
  className,
  size = 24,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      viewBox={FAN_VIEWBOX}
      fill="none"
      className={className}
      style={{ overflow: "visible" }}
      aria-hidden="true"
    >
      <g
        stroke="currentColor"
        strokeWidth={fanStrokeViewbox(size)}
        strokeLinecap="round"
      >
        {fanSegments().map((s, i) => (
          <line
            key={i}
            x1={s.x1.toFixed(2)}
            y1={s.y1.toFixed(2)}
            x2={s.x2.toFixed(2)}
            y2={s.y2.toFixed(2)}
          />
        ))}
      </g>
    </svg>
  );
}

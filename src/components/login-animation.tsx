import { useEffect, useRef } from "react";

import {
  FAN,
  FAN_VIEWBOX,
  fanSegmentAt,
  fanSegments,
  fanStrokeViewbox,
} from "@/lib/brand/fan";
import { fanLoopFrame } from "@/lib/brand/fan-motion";
import { cn } from "@/lib/utils";

export function LoginAnimation({
  variant = "dark",
  className,
  size = 144,
}: {
  variant?: "dark" | "light";
  className?: string;
  size?: number;
}) {
  const groupRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const lines = Array.from(group.children) as SVGLineElement[];
    const rayLength = FAN.outerR - FAN.innerR;
    for (const line of lines) {
      line.setAttribute("stroke-dasharray", String(rayLength));
    }

    const startedAt = performance.now();
    let raf: number;
    function tick(now: number) {
      const frame = fanLoopFrame((now - startedAt) / 1000, FAN);
      frame.forEach((ray, i) => {
        const s = fanSegmentAt(ray.angle, FAN);
        lines[i].setAttribute("x1", s.x1.toFixed(2));
        lines[i].setAttribute("y1", s.y1.toFixed(2));
        lines[i].setAttribute("x2", s.x2.toFixed(2));
        lines[i].setAttribute("y2", s.y2.toFixed(2));
        lines[i].setAttribute("stroke-dashoffset", ray.dashOffset.toFixed(2));
      });
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <svg
      viewBox={FAN_VIEWBOX}
      className={cn(
        "overflow-visible",
        {
          "text-white": variant === "light",
          "text-foreground/70": variant !== "light",
        },
        className ?? "size-56"
      )}
      fill="none"
    >
      <g
        ref={groupRef}
        stroke="currentColor"
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
    </svg>
  );
}

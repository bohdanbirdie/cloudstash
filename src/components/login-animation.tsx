import { useEffect, useRef } from "react";

import { torusKnotPoint } from "@/lib/brand/torus-knot";
import type { TorusKnotConfig } from "@/lib/brand/torus-knot";

const CONFIG: TorusKnotConfig = { R: 16, r: 8, cx: 50, cy: 50 };
const PARTICLE_COUNT = 82;
const TRAIL_SPAN = 0.24;
const DURATION_MS = 6200;
const PULSE_MS = 5200;
const R_BASE = 16;
const R_BREATH = 2;

export function LoginAnimation({
  variant = "dark",
  className,
}: {
  variant?: "dark" | "light";
  className?: string;
}) {
  const groupRef = useRef<SVGGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const group = groupRef.current!;
    const path = pathRef.current!;
    if (!group || !path) return;

    const particleFill = variant === "light" ? "#000000" : "currentColor";

    const NS = "http://www.w3.org/2000/svg";
    const circles: SVGCircleElement[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("fill", particleFill);
      group.appendChild(c);
      circles.push(c);
    }

    const startedAt = performance.now();
    let raf: number;

    function tick(now: number) {
      const time = now - startedAt;
      const progress = (time % DURATION_MS) / DURATION_MS;
      const pulseP = (time % PULSE_MS) / PULSE_MS;
      const s = 0.52 + ((Math.sin(pulseP * Math.PI * 2 + 0.55) + 1) / 2) * 0.48;
      const R = R_BASE + s * R_BREATH;
      const rotation = -((time % 34000) / 34000) * 360;

      group.setAttribute("transform", `rotate(${rotation} 50 50)`);

      let d = "";
      for (let i = 0; i <= 480; i++) {
        const pt = torusKnotPoint(i / 480, { ...CONFIG, R });
        d += `${i === 0 ? "M" : "L"} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)} `;
      }
      path.setAttribute("d", d + "Z");

      for (let idx = 0; idx < circles.length; idx++) {
        const tailOffset = idx / (PARTICLE_COUNT - 1);
        const p = (((progress - tailOffset * TRAIL_SPAN) % 1) + 1) % 1;
        const pt = torusKnotPoint(p, { ...CONFIG, R });
        const fade = (1 - tailOffset) ** 0.56;

        circles[idx].setAttribute("cx", pt.x.toFixed(2));
        circles[idx].setAttribute("cy", pt.y.toFixed(2));
        circles[idx].setAttribute("r", (0.9 + fade * 2.7).toFixed(2));
        circles[idx].setAttribute("opacity", (0.04 + fade * 0.96).toFixed(3));
      }

      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      for (const c of circles) c.remove();
    };
  }, [variant]);

  return (
    <svg
      viewBox="0 0 100 100"
      className={`overflow-visible ${variant === "light" ? "text-white" : "text-foreground/50"} ${className ?? "size-56"}`}
      fill="none"
    >
      <g ref={groupRef}>
        <path
          ref={pathRef}
          stroke="currentColor"
          strokeWidth={4.3}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={variant === "light" ? 1 : 0.08}
        />
      </g>
    </svg>
  );
}

import { useEffect, useRef } from "react";

import { sphereDots, SPHERE_FINE, SPHERE_TILT } from "@/lib/brand/sphere";
import { cn } from "@/lib/utils";

const RADIUS = 34;
const BASE = (SPHERE_FINE.base * RADIUS) / 56;
/** Radians a second at rest, as the Mac app's logo turns. */
const IDLE = 0.45;
/** It never turns slower than this on its own: a crawl makes the dots shimmer. */
const SLOWEST = 0.3;

/**
 * The logo, turning: the ball of dots on the sign-in and loading screens. As in the Mac app
 * (apps/native/src/sphere.rs) it leans toward a nearby pointer, and a drag turns and tips it.
 */
export function LoginAnimation({
  variant = "dark",
  className,
}: {
  variant?: "dark" | "light";
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const groupRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const group = groupRef.current;
    if (!svg || !group) return;

    const NS = "http://www.w3.org/2000/svg";
    const circles: SVGCircleElement[] = [];
    const m = {
      yaw: 0,
      turned: 0,
      speed: IDLE,
      pitch: 0,
      look: [0, 0],
      pointer: null as [number, number] | null,
      drag: null as [number, number] | null,
    };

    function draw() {
      const dots = sphereDots(
        SPHERE_FINE.count,
        SPHERE_FINE.floor,
        m.yaw - m.look[0],
        true,
        SPHERE_TILT - m.look[1] - m.pitch
      );
      while (circles.length < dots.length) {
        const c = document.createElementNS(NS, "circle");
        c.setAttribute("fill", "currentColor");
        group!.appendChild(c);
        circles.push(c);
      }
      for (const [i, c] of circles.entries()) {
        const dot = dots[i];
        if (!dot) {
          c.setAttribute("opacity", "0");
          continue;
        }
        c.setAttribute("cx", (50 + RADIUS * dot.x).toFixed(2));
        c.setAttribute("cy", (50 + RADIUS * dot.y).toFixed(2));
        c.setAttribute("r", (BASE * dot.size).toFixed(2));
        c.setAttribute("opacity", dot.opacity.toFixed(3));
      }
    }
    draw();
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return () => {
        for (const c of circles) c.remove();
      };
    }

    /** The ball's centre and radius on the page. */
    function ball() {
      const box = svg!.getBoundingClientRect();
      return {
        x: box.left + box.width / 2,
        y: box.top + box.height / 2,
        radius: (box.width * RADIUS) / 100,
      };
    }

    let last = performance.now();
    let raf = 0;
    function tick(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const ease = (rate: number) => Math.min(rate * dt, 1);
      if (m.drag) {
        // The hand turns it; remember how fast, so it keeps going when let go.
        if (dt > 0) m.speed += ((m.yaw - m.turned) / dt - m.speed) * 0.35;
        m.look = [m.look[0] * (1 - ease(7)), m.look[1] * (1 - ease(7))];
      } else {
        // It leans toward a pointer within about two and a half of its radii, less the farther off.
        let want = [0, 0];
        if (m.pointer) {
          const { x, y, radius } = ball();
          const [dx, dy] = [m.pointer[0] - x, m.pointer[1] - y];
          const far = Math.min(
            1,
            Math.max(0, (Math.hypot(dx, dy) / radius - 1.25) / 1.5)
          );
          const pull = 1 - far * far * (3 - 2 * far);
          want = [
            (dx / (2.75 * radius)) * 0.8 * pull,
            (dy / (2.75 * radius)) * 0.5 * pull,
          ];
        }
        m.speed += (IDLE - m.speed) * ease(1.4);
        // Let go while turning backwards, it slows, then picks up forwards without crawling through a stop.
        if (Math.abs(m.speed) < SLOWEST) m.speed = SLOWEST;
        m.yaw += m.speed * dt;
        m.pitch *= 1 - ease(1.2);
        m.look = [
          m.look[0] + (want[0] - m.look[0]) * ease(7),
          m.look[1] + (want[1] - m.look[1]) * ease(7),
        ];
      }
      m.turned = m.yaw;
      draw();
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    const onMove = (e: PointerEvent) => {
      m.pointer = [e.clientX, e.clientY];
      if (!m.drag) return;
      const { radius } = ball();
      m.yaw -= (e.clientX - m.drag[0]) / radius;
      m.pitch = Math.min(
        1.2,
        Math.max(-1.2, m.pitch + (e.clientY - m.drag[1]) / radius)
      );
      m.drag = [e.clientX, e.clientY];
    };
    const onLeave = () => {
      m.pointer = null;
    };
    const onDown = (e: PointerEvent) => {
      m.drag = [e.clientX, e.clientY];
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const onUp = () => {
      m.drag = null;
    };
    window.addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("pointerleave", onLeave);
    svg.addEventListener("pointerdown", onDown);
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", onUp);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      svg.removeEventListener("pointerdown", onDown);
      svg.removeEventListener("pointerup", onUp);
      svg.removeEventListener("pointercancel", onUp);
      for (const c of circles) c.remove();
    };
  }, []);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 100 100"
      className={cn(
        "cursor-grab touch-none overflow-visible active:cursor-grabbing motion-reduce:cursor-auto",
        {
          "text-white": variant === "light",
          "text-foreground": variant !== "light",
        },
        className ?? "size-56"
      )}
      aria-hidden="true"
    >
      {/* Something to grab between the dots. */}
      <circle cx={50} cy={50} r={RADIUS} fill="transparent" />
      <g ref={groupRef} />
    </svg>
  );
}

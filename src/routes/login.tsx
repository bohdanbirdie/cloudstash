import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { SITE_URL } from "@/components/landing/seo-data";
import { LoginAnimation } from "@/components/login-animation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldGroup, FieldDescription } from "@/components/ui/field";
import { authClient, loadAuth } from "@/lib/auth";
import type { DitherPalette } from "@/lib/brand/dither";
import { PALETTES, paintDitherWithEffects } from "@/lib/brand/dither";
import { META_PIXEL_HEAD_SCRIPTS, MetaPixelNoScript } from "@/lib/meta-pixel";
import { PLANS } from "@/lib/plan";
import { cn } from "@/lib/utils";

const SUNSET = PALETTES.find((p) => p.name === "Sunset")!;
const DITHER_CELL_SIZE = 3.5;
const WAVE_VELOCITY_CSS = 0.08;
const WAVE_SPACING_CSS = 280;
const WAVE_SIGMA_CSS = 40;
const WAVE_AMP = 0.012;
const WAVE_FREQ_CSS = 0.15;
const DITHER_FPS = 15;
const ASCII_CHARS = "abcdef0123456789-_~.:/?=&#%";
const ASCII_CELL_CSS = 18;
const ASCII_FONT_CSS = 14;
const ASCII_REVEAL_RADIUS_CSS = 72;
const ASCII_OPACITY_EASE = 0.16;
const ASCII_SYMBOL_MIN_MS = 90;
const ASCII_SYMBOL_MAX_MS = 280;

async function clearOPFS() {
  if (typeof navigator === "undefined" || !navigator.storage?.getDirectory)
    return;
  const root = await navigator.storage.getDirectory();
  for await (const name of root.keys()) {
    if (name.startsWith("livestore")) {
      await root.removeEntry(name, { recursive: true }).catch(() => {});
    }
  }
}

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const auth = await loadAuth();
    if (auth?.isAuthenticated) throw redirect({ to: "/inbox" });
  },
  validateSearch: (
    search: Record<string, unknown>
  ): { upgrade?: "plus" | "pro" } => ({
    upgrade:
      search.upgrade === "plus" || search.upgrade === "pro"
        ? search.upgrade
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Cloudstash" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/login` }],
    scripts: [...META_PIXEL_HEAD_SCRIPTS],
  }),
  component: LoginPage,
});

function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const upgrade = Route.useSearch({ select: (s) => s.upgrade });
  const callbackURL = upgrade ? `/inbox?upgrade=${upgrade}` : "/inbox";
  const heading = upgrade
    ? `Sign in to start ${PLANS[upgrade].name}`
    : "Sign in";

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <div className="flex flex-col justify-center p-6 md:p-8 md:min-h-[400px]">
            <FieldGroup>
              <div className="flex justify-center md:hidden">
                <LoginAnimation className="size-36" />
              </div>
              <h1 className="text-center text-2xl font-bold text-balance">
                {heading}
              </h1>
              <Button
                className="w-full"
                onClick={() =>
                  authClient.signIn.oauth2({
                    providerId: "google",
                    callbackURL,
                  })
                }
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  aria-hidden
                >
                  <path
                    d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                    fill="currentColor"
                  />
                </svg>
                Continue with Google
              </Button>
            </FieldGroup>
          </div>
          <BrandPane />
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        By clicking continue, you agree to our{" "}
        <Link to="/terms">Terms of Service</Link> and{" "}
        <Link to="/privacy">Privacy Policy</Link>.
      </FieldDescription>
    </div>
  );
}

type AsciiCell = {
  cx: number;
  cy: number;
  symbol: string;
  opacity: number;
  target: number;
  nextChangeMs: number;
};

function resolveBrandPalette(): DitherPalette {
  try {
    const cnv = document.createElement("canvas");
    cnv.width = 1;
    cnv.height = 1;
    const tctx = cnv.getContext("2d");
    if (!tctx) return SUNSET;
    const primaryVar = getComputedStyle(document.documentElement)
      .getPropertyValue("--primary")
      .trim();
    if (!primaryVar) return SUNSET;
    tctx.fillStyle = primaryVar;
    tctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = tctx.getImageData(0, 0, 1, 1).data;
    return { ...SUNSET, b: { r, g, b } };
  } catch {
    return SUNSET;
  }
}

function pickSymbol(): string {
  return ASCII_CHARS[Math.floor(Math.random() * ASCII_CHARS.length)];
}

function nextSymbolDeadline(now: number): number {
  return (
    now +
    ASCII_SYMBOL_MIN_MS +
    Math.random() * (ASCII_SYMBOL_MAX_MS - ASCII_SYMBOL_MIN_MS)
  );
}

function BrandPane() {
  const paneRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const asciiCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const pane = paneRef.current;
    const canvas = canvasRef.current;
    const asciiCanvas = asciiCanvasRef.current;
    if (!pane || !canvas || !asciiCanvas) return;
    const ctx = canvas.getContext("2d")!;
    const asciiCtx = asciiCanvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const palette = resolveBrandPalette();

    let canvasW = 0;
    let canvasH = 0;
    let cssW = 0;
    let cssH = 0;
    function resize() {
      const rect = pane!.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      cssW = rect.width;
      cssH = rect.height;
      canvasW = Math.ceil(cssW * dpr);
      canvasH = Math.ceil(cssH * dpr);
      canvas!.width = canvasW;
      canvas!.height = canvasH;
      asciiCanvas!.width = canvasW;
      asciiCanvas!.height = canvasH;
      asciiCtx.font = `${ASCII_FONT_CSS * dpr}px "JetBrains Mono Variable", ui-monospace, monospace`;
      asciiCtx.textAlign = "center";
      asciiCtx.textBaseline = "middle";
    }
    resize();

    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (reducedMotion) {
      function paintStatic() {
        if (canvasW > 0 && canvasH > 0) {
          paintDitherWithEffects(
            ctx,
            canvasW,
            canvasH,
            DITHER_CELL_SIZE * dpr,
            palette,
            null,
            null
          );
        }
      }
      paintStatic();
      const ro = new ResizeObserver(() => {
        resize();
        paintStatic();
      });
      ro.observe(pane);
      return () => ro.disconnect();
    }

    let cursorX = 0;
    let cursorY = 0;
    let cursorActive = false;

    function onMouseEnter(e: MouseEvent) {
      const rect = pane!.getBoundingClientRect();
      cursorX = e.clientX - rect.left;
      cursorY = e.clientY - rect.top;
      cursorActive = true;
    }
    function onMouseMove(e: MouseEvent) {
      const rect = pane!.getBoundingClientRect();
      cursorX = e.clientX - rect.left;
      cursorY = e.clientY - rect.top;
    }
    function onMouseLeave() {
      cursorActive = false;
    }
    pane.addEventListener("mouseenter", onMouseEnter);
    pane.addEventListener("mousemove", onMouseMove);
    pane.addEventListener("mouseleave", onMouseLeave);

    const waveSigma = WAVE_SIGMA_CSS * dpr;
    const waveFreq = WAVE_FREQ_CSS / dpr;
    const waveSpacing = WAVE_SPACING_CSS * dpr;
    const waveVelocity = WAVE_VELOCITY_CSS * dpr;

    const cells = new Map<number, AsciiCell>();
    const removeQueue: number[] = [];

    const startedAt = performance.now();
    const frameMs = 1000 / DITHER_FPS;
    let lastFrame = 0;
    let raf: number;

    function tick(now: number) {
      if (now - lastFrame >= frameMs && canvasW > 0 && canvasH > 0) {
        lastFrame = now;
        const elapsed = now - startedAt;
        const wavePhase = (elapsed * waveVelocity) % waveSpacing;
        paintDitherWithEffects(
          ctx,
          canvasW,
          canvasH,
          DITHER_CELL_SIZE * dpr,
          palette,
          {
            phase: wavePhase,
            sigma: waveSigma,
            amplitude: WAVE_AMP,
            frequency: waveFreq,
            spacing: waveSpacing,
          },
          null
        );
      }

      for (const cell of cells.values()) cell.target = 0;

      if (cursorActive && cssW > 0) {
        const cols = Math.ceil(cssW / ASCII_CELL_CSS);
        const rows = Math.ceil(cssH / ASCII_CELL_CSS);
        const radius2 = ASCII_REVEAL_RADIUS_CSS * ASCII_REVEAL_RADIUS_CSS;
        const cMin = Math.max(
          0,
          Math.floor((cursorX - ASCII_REVEAL_RADIUS_CSS) / ASCII_CELL_CSS)
        );
        const cMax = Math.min(
          cols - 1,
          Math.floor((cursorX + ASCII_REVEAL_RADIUS_CSS) / ASCII_CELL_CSS)
        );
        const rMin = Math.max(
          0,
          Math.floor((cursorY - ASCII_REVEAL_RADIUS_CSS) / ASCII_CELL_CSS)
        );
        const rMax = Math.min(
          rows - 1,
          Math.floor((cursorY + ASCII_REVEAL_RADIUS_CSS) / ASCII_CELL_CSS)
        );
        for (let r = rMin; r <= rMax; r++) {
          for (let c = cMin; c <= cMax; c++) {
            const cx = (c + 0.5) * ASCII_CELL_CSS;
            const cy = (r + 0.5) * ASCII_CELL_CSS;
            const dx = cx - cursorX;
            const dy = cy - cursorY;
            const d2 = dx * dx + dy * dy;
            if (d2 < radius2) {
              const target = 1 - Math.sqrt(d2) / ASCII_REVEAL_RADIUS_CSS;
              const key = r * 10000 + c;
              let cell = cells.get(key);
              if (!cell) {
                cell = {
                  cx,
                  cy,
                  symbol: pickSymbol(),
                  opacity: 0,
                  target,
                  nextChangeMs: nextSymbolDeadline(now),
                };
                cells.set(key, cell);
              } else {
                cell.target = target;
              }
            }
          }
        }
      }

      asciiCtx.clearRect(0, 0, canvasW, canvasH);
      asciiCtx.fillStyle = "#ffffff";
      removeQueue.length = 0;
      for (const [key, cell] of cells) {
        cell.opacity += (cell.target - cell.opacity) * ASCII_OPACITY_EASE;
        if (cell.opacity > 0.12 && now >= cell.nextChangeMs) {
          cell.symbol = pickSymbol();
          cell.nextChangeMs = nextSymbolDeadline(now);
        }
        if (cell.opacity > 0.005) {
          asciiCtx.globalAlpha = cell.opacity;
          asciiCtx.fillText(cell.symbol, cell.cx * dpr, cell.cy * dpr);
        } else if (cell.target < 0.001) {
          removeQueue.push(key);
        }
      }
      asciiCtx.globalAlpha = 1;
      for (const key of removeQueue) cells.delete(key);

      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    const ro = new ResizeObserver(() => {
      resize();
      lastFrame = 0;
    });
    ro.observe(pane);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      pane.removeEventListener("mouseenter", onMouseEnter);
      pane.removeEventListener("mousemove", onMouseMove);
      pane.removeEventListener("mouseleave", onMouseLeave);
    };
  }, []);

  return (
    <div
      ref={paneRef}
      className="relative hidden md:flex items-center justify-center overflow-hidden"
      style={{
        backgroundColor: `rgb(${SUNSET.a.r} ${SUNSET.a.g} ${SUNSET.a.b})`,
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="absolute inset-0 size-full"
        style={{ imageRendering: "pixelated" }}
      />
      <canvas
        ref={asciiCanvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, transparent 70%, rgba(0,0,0,0.22) 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 3%, rgba(0,0,0,0) 97%, rgba(0,0,0,0.15) 100%)",
        }}
      />
      <LoginAnimation variant="light" className="relative z-10 size-56" />
    </div>
  );
}

function LoginPage() {
  useEffect(() => {
    void clearOPFS();
  }, []);

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-3xl">
        <LoginForm />
      </div>
      <MetaPixelNoScript />
    </div>
  );
}

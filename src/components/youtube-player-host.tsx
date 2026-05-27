import { GripVerticalIcon, PictureInPicture2Icon, XIcon } from "lucide-react";
import { motion, useDragControls, useMotionValue } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNarrowViewport } from "@/hooks/use-narrow-viewport";
import { cn } from "@/lib/utils";
import { useRightPaneStore } from "@/stores/right-pane-store";
import { useYouTubePlayerStore } from "@/stores/youtube-player-store";
import type { FloatingSize } from "@/stores/youtube-player-store";

const TITLE_BAR_HEIGHT = 32;
const BODY_PAD = 4;
const FRAME_RADIUS_FLOATING = 10;
const FRAME_RADIUS_ANCHORED = 6;
const VIEWPORT_MARGIN = 16;
const MIN_VISIBLE = 48;

const SIZE_WIDTHS: Record<FloatingSize, number> = {
  m: 380,
  l: 520,
  xl: 720,
};

const SIZE_ORDER: FloatingSize[] = ["m", "l", "xl"];
const SIZE_LABELS: Record<FloatingSize, string> = {
  m: "Medium",
  l: "Large",
  xl: "Extra large",
};

const MOVE_TWEEN = { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const };
const TRANSITION = {
  x: MOVE_TWEEN,
  y: MOVE_TWEEN,
  width: MOVE_TWEEN,
  height: MOVE_TWEEN,
  borderRadius: MOVE_TWEEN,
  paddingTop: MOVE_TWEEN,
  paddingLeft: MOVE_TWEEN,
  paddingRight: MOVE_TWEEN,
  paddingBottom: MOVE_TWEEN,
};

function dimensionsForSize(size: FloatingSize) {
  const width = SIZE_WIDTHS[size];
  const innerW = width - BODY_PAD * 2;
  const innerH = Math.round((innerW * 9) / 16);
  const height = TITLE_BAR_HEIGHT + innerH + BODY_PAD;
  return { width, height };
}

function defaultPosFor(size: FloatingSize, vw: number, vh: number) {
  const { width, height } = dimensionsForSize(size);
  return {
    x: vw - width - VIEWPORT_MARGIN,
    y: vh - height - VIEWPORT_MARGIN,
  };
}

function clampPos(
  pos: { x: number; y: number },
  size: FloatingSize,
  vw: number,
  vh: number
) {
  const { width } = dimensionsForSize(size);
  const maxX = vw - MIN_VISIBLE;
  const minX = MIN_VISIBLE - width;
  const maxY = vh - MIN_VISIBLE;
  const minY = 0;
  return {
    x: Math.min(maxX, Math.max(minX, pos.x)),
    y: Math.min(maxY, Math.max(minY, pos.y)),
  };
}

function resizeTowardClosestCorner(
  pos: { x: number; y: number },
  oldSize: FloatingSize,
  newSize: FloatingSize,
  vw: number,
  vh: number
) {
  const oldDims = dimensionsForSize(oldSize);
  const newDims = dimensionsForSize(newSize);

  const distLeft = pos.x;
  const distRight = vw - (pos.x + oldDims.width);
  const anchorRight = distRight < distLeft;

  const distTop = pos.y;
  const distBottom = vh - (pos.y + oldDims.height);
  const anchorBottom = distBottom < distTop;

  return {
    x: anchorRight ? pos.x + oldDims.width - newDims.width : pos.x,
    y: anchorBottom ? pos.y + oldDims.height - newDims.height : pos.y,
  };
}

function useViewport() {
  const [viewport, setViewport] = useState(() =>
    typeof window === "undefined"
      ? { w: 0, h: 0 }
      : { w: window.innerWidth, h: window.innerHeight }
  );

  useEffect(() => {
    const onResize = () =>
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return viewport;
}

export function YouTubePlayerHost() {
  const isNarrow = useNarrowViewport();
  const videoId = useYouTubePlayerStore((s) => s.videoId);
  const sourceLinkId = useYouTubePlayerStore((s) => s.sourceLinkId);
  const startSeconds = useYouTubePlayerStore((s) => s.startSeconds);
  const anchorRect = useYouTubePlayerStore((s) => s.anchorRect);
  const floatingPosFraction = useYouTubePlayerStore(
    (s) => s.floatingPosFraction
  );
  const floatingSize = useYouTubePlayerStore((s) => s.floatingSize);
  const setFloatingPosFraction = useYouTubePlayerStore(
    (s) => s.setFloatingPosFraction
  );
  const setFloatingSize = useYouTubePlayerStore((s) => s.setFloatingSize);
  const clear = useYouTubePlayerStore((s) => s.clear);
  const activeLinkId = useRightPaneStore((s) => s.activeLinkId);
  const openDetail = useRightPaneStore((s) => s.openDetail);
  const dragControls = useDragControls();
  const viewport = useViewport();

  const isAnchored =
    !isNarrow &&
    anchorRect !== null &&
    sourceLinkId !== null &&
    activeLinkId === sourceLinkId;

  const floatingDims = dimensionsForSize(floatingSize);
  const floatingRaw =
    floatingPosFraction === null
      ? defaultPosFor(floatingSize, viewport.w, viewport.h)
      : {
          x: floatingPosFraction.fx * viewport.w,
          y: floatingPosFraction.fy * viewport.h,
        };
  const floating =
    viewport.w === 0
      ? { x: 0, y: 0 }
      : clampPos(floatingRaw, floatingSize, viewport.w, viewport.h);

  const target =
    isAnchored && anchorRect
      ? {
          x: anchorRect.x,
          y: anchorRect.y,
          width: anchorRect.width,
          height: anchorRect.height,
          radius: FRAME_RADIUS_ANCHORED,
          padTop: 0,
          padX: 0,
          padBottom: 0,
        }
      : {
          x: floating.x,
          y: floating.y,
          width: floatingDims.width,
          height: floatingDims.height,
          radius: FRAME_RADIUS_FLOATING,
          padTop: TITLE_BAR_HEIGHT,
          padX: BODY_PAD,
          padBottom: BODY_PAD,
        };

  const x = useMotionValue(target.x);
  const y = useMotionValue(target.y);

  const wasVisibleRef = useRef(false);
  useEffect(() => {
    const visible = videoId !== null && !isNarrow;
    if (visible && !wasVisibleRef.current) {
      x.jump(target.x);
      y.jump(target.y);
    }
    wasVisibleRef.current = visible;
  }, [videoId, isNarrow, target.x, target.y, x, y]);

  if (videoId === null || isNarrow) return null;

  const params = new URLSearchParams({
    autoplay: "1",
    rel: "0",
    iv_load_policy: "3",
    playsinline: "1",
  });
  if (startSeconds) params.set("start", String(startSeconds));
  const src = `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;

  const handleSizeChange = (values: FloatingSize[]) => {
    const next = values[0];
    if (!next || next === floatingSize) return;
    setFloatingSize(next);

    if (viewport.w === 0) return;
    const currentPx =
      floatingPosFraction === null
        ? defaultPosFor(floatingSize, viewport.w, viewport.h)
        : {
            x: floatingPosFraction.fx * viewport.w,
            y: floatingPosFraction.fy * viewport.h,
          };
    const anchored = resizeTowardClosestCorner(
      currentPx,
      floatingSize,
      next,
      viewport.w,
      viewport.h
    );
    const clamped = clampPos(anchored, next, viewport.w, viewport.h);
    setFloatingPosFraction({
      fx: clamped.x / viewport.w,
      fy: clamped.y / viewport.h,
    });
  };

  return (
    <motion.div
      data-yt-player
      className={cn(
        "fixed top-0 left-0 z-50 overflow-hidden bg-background will-change-transform",
        !isAnchored &&
          "border border-border shadow-[0_2px_6px_-1px_rgb(0_0_0_/_0.06),0_18px_44px_-10px_rgb(0_0_0_/_0.22)] dark:shadow-[0_2px_6px_-1px_rgb(0_0_0_/_0.4),0_22px_50px_-10px_rgb(0_0_0_/_0.65)]"
      )}
      style={{ x, y }}
      animate={{
        x: target.x,
        y: target.y,
        width: target.width,
        height: target.height,
        borderRadius: target.radius,
        paddingTop: target.padTop,
        paddingLeft: target.padX,
        paddingRight: target.padX,
        paddingBottom: target.padBottom,
      }}
      transition={TRANSITION}
      drag={!isAnchored}
      dragListener={false}
      dragControls={dragControls}
      dragMomentum={false}
      dragElastic={0}
      onDragEnd={() => {
        if (viewport.w === 0) return;
        const clamped = clampPos(
          { x: x.get(), y: y.get() },
          floatingSize,
          viewport.w,
          viewport.h
        );
        setFloatingPosFraction({
          fx: clamped.x / viewport.w,
          fy: clamped.y / viewport.h,
        });
      }}
    >
      {!isAnchored && (
        <div
          className="absolute inset-x-0 top-0 flex h-8 cursor-grab touch-none items-center justify-between gap-2 bg-background px-1.5 select-none active:cursor-grabbing"
          onPointerDown={(e) => {
            document.body.classList.add("yt-player-dragging");
            const onUp = () => {
              document.body.classList.remove("yt-player-dragging");
              document.removeEventListener("pointerup", onUp);
              document.removeEventListener("pointercancel", onUp);
            };
            document.addEventListener("pointerup", onUp);
            document.addEventListener("pointercancel", onUp);
            dragControls.start(e);
          }}
        >
          <div className="flex min-w-0 items-center gap-1 text-muted-foreground">
            <GripVerticalIcon
              className="size-3.5 shrink-0"
              aria-hidden="true"
            />
            <span className="truncate text-[11px] font-medium tracking-tight">
              YouTube
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <ToggleGroup<FloatingSize>
              value={[floatingSize]}
              onValueChange={handleSizeChange}
              aria-label="Player size"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {SIZE_ORDER.map((size) => (
                <ToggleGroupItem
                  key={size}
                  value={size}
                  aria-label={SIZE_LABELS[size]}
                >
                  {size.toUpperCase()}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {sourceLinkId && activeLinkId !== sourceLinkId && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={() => openDetail(sourceLinkId)}
                      onPointerDown={(e) => e.stopPropagation()}
                      aria-label="Return to source link"
                      className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-1 focus-visible:outline-ring focus-visible:outline-offset-1"
                    />
                  }
                >
                  <PictureInPicture2Icon className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Return to source link
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={clear}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label="Close player"
                    className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-1 focus-visible:outline-ring focus-visible:outline-offset-1"
                  />
                }
              >
                <XIcon className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent side="bottom">Close player</TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}
      <iframe
        key={videoId}
        src={src}
        title="YouTube video player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className={cn(
          "size-full border-0 bg-black",
          !isAnchored && "rounded-sm"
        )}
      />
    </motion.div>
  );
}

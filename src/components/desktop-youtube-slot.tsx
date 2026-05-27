import { useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { useYouTubePlayerStore } from "@/stores/youtube-player-store";

import { YOUTUBE_OUTLINE_CLASS, YouTubeThumbnail } from "./youtube-thumbnail";

interface DesktopYouTubeSlotProps {
  linkId: string;
  videoId: string;
  startSeconds?: number;
  thumbnail: string | null | undefined;
}

export function DesktopYouTubeSlot({
  linkId,
  videoId,
  startSeconds,
  thumbnail,
}: DesktopYouTubeSlotProps) {
  const activeVideoId = useYouTubePlayerStore((s) => s.videoId);
  const activeSourceLinkId = useYouTubePlayerStore((s) => s.sourceLinkId);
  const setVideo = useYouTubePlayerStore((s) => s.setVideo);
  const setAnchorRect = useYouTubePlayerStore((s) => s.setAnchorRect);

  const isAnchored = activeVideoId === videoId && activeSourceLinkId === linkId;

  const anchorRef = useRef<HTMLDivElement | null>(null);
  const thumbnailButtonRef = useRef<HTMLButtonElement | null>(null);

  const handlePlay = () => {
    const rect = thumbnailButtonRef.current?.getBoundingClientRect();
    setVideo({
      videoId,
      sourceLinkId: linkId,
      startSeconds,
      anchorRect: rect
        ? {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          }
        : null,
    });
  };

  useLayoutEffect(() => {
    if (!isAnchored) return;
    const el = anchorRef.current;
    if (!el) return;

    let last = { x: 0, y: 0, width: 0, height: 0 };
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (
        Math.abs(rect.x - last.x) < 0.5 &&
        Math.abs(rect.y - last.y) < 0.5 &&
        Math.abs(rect.width - last.width) < 0.5 &&
        Math.abs(rect.height - last.height) < 0.5
      ) {
        return;
      }
      last = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
      setAnchorRect(last);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);

    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [isAnchored, setAnchorRect]);

  if (isAnchored) {
    return (
      <div
        ref={anchorRef}
        className={cn("size-full bg-black", YOUTUBE_OUTLINE_CLASS)}
        aria-hidden="true"
      />
    );
  }

  return (
    <YouTubeThumbnail
      buttonRef={thumbnailButtonRef}
      videoId={videoId}
      thumbnail={thumbnail}
      onPlay={handlePlay}
    />
  );
}

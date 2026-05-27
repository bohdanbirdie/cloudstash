import { useState } from "react";

import { cn } from "@/lib/utils";

import { YOUTUBE_OUTLINE_CLASS, YouTubeThumbnail } from "./youtube-thumbnail";

interface YouTubeFacadeProps {
  videoId: string;
  startSeconds?: number;
  thumbnail: string | null | undefined;
}

export function YouTubeFacade({
  videoId,
  startSeconds,
  thumbnail,
}: YouTubeFacadeProps) {
  const [active, setActive] = useState(false);

  if (active) {
    const params = new URLSearchParams({
      autoplay: "1",
      rel: "0",
      iv_load_policy: "3",
      playsinline: "1",
    });
    if (startSeconds) params.set("start", String(startSeconds));
    const src = `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
    return (
      <iframe
        src={src}
        title="YouTube video player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className={cn("size-full border-0 bg-black", YOUTUBE_OUTLINE_CLASS)}
      />
    );
  }

  return (
    <YouTubeThumbnail
      videoId={videoId}
      thumbnail={thumbnail}
      onPlay={() => setActive(true)}
    />
  );
}

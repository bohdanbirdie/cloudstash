import { PlayIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

interface YouTubeThumbnailProps {
  videoId: string;
  thumbnail: string | null | undefined;
  onPlay: () => void;
  className?: string;
  buttonRef?: React.Ref<HTMLButtonElement>;
}

export const YOUTUBE_OUTLINE_CLASS =
  "rounded-sm outline outline-black/10 -outline-offset-1 dark:outline-white/10";

export function YouTubeThumbnail({
  videoId,
  thumbnail,
  onPlay,
  className,
  buttonRef,
}: YouTubeThumbnailProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const imgSrc = thumbnail ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onPlay}
      aria-label="Play video"
      className={cn(
        "group relative block size-full cursor-pointer overflow-hidden bg-black",
        YOUTUBE_OUTLINE_CLASS,
        className
      )}
    >
      <link rel="preconnect" href="https://www.youtube-nocookie.com" />
      <link rel="preconnect" href="https://i.ytimg.com" />
      {!imgFailed && (
        <img
          src={imgSrc}
          alt=""
          loading="eager"
          decoding="async"
          draggable={false}
          onError={() => setImgFailed(true)}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      )}
      <div className="absolute inset-0 bg-black/0 transition-colors duration-200 group-hover:bg-black/15" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex h-14 w-20 items-center justify-center rounded-xl bg-[#FF0000] shadow-lg transition-transform duration-200 group-hover:scale-110 group-active:scale-95">
          <PlayIcon className="size-7 fill-white text-white" />
        </div>
      </div>
    </button>
  );
}

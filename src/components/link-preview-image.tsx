import { ImageOff } from "lucide-react";
import { useState } from "react";

import { CloudstashLogo } from "@/components/cloudstash-logo";
import { cn } from "@/lib/utils";

interface LinkPreviewImageProps {
  src: string | null | undefined;
  loading?: "lazy" | "eager";
}

type Status = "loading" | "loaded" | "error";

const OUTLINE_CLASS =
  "rounded-sm outline outline-black/10 -outline-offset-1 dark:outline-white/10";

export function LinkPreviewImage({
  src,
  loading = "lazy",
}: LinkPreviewImageProps) {
  const [status, setStatus] = useState<Status>(src ? "loading" : "error");
  const [prevSrc, setPrevSrc] = useState(src);

  if (prevSrc !== src) {
    setPrevSrc(src);
    setStatus(src ? "loading" : "error");
  }

  if (!src || status === "error") {
    return (
      <div
        className={cn(
          "flex size-full items-center justify-center bg-muted",
          OUTLINE_CLASS
        )}
        aria-hidden="true"
      >
        <ImageOff className="size-1/4 max-h-12 max-w-12 text-zinc-400 dark:text-zinc-500" />
      </div>
    );
  }

  return (
    <div className={cn("relative size-full overflow-hidden", OUTLINE_CLASS)}>
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-300",
          {
            "opacity-100 delay-200 starting:opacity-0": status === "loading",
            "opacity-0": status !== "loading",
          },
        )}
        aria-hidden="true"
      >
        <div className="absolute inset-0 animate-pulse bg-muted" />
        <div className="absolute inset-0 flex items-center justify-center">
          <CloudstashLogo className="size-1/3 max-h-20 max-w-20 text-zinc-300 dark:text-zinc-600" />
        </div>
      </div>
      <img
        ref={(img) => {
          if (img?.complete) {
            setStatus(img.naturalWidth > 0 ? "loaded" : "error");
          }
        }}
        src={src}
        alt=""
        loading={loading}
        decoding="async"
        className={cn(
          "relative block size-full object-cover transition-opacity duration-200",
          OUTLINE_CLASS,
          {
            "opacity-100": status === "loaded",
            "opacity-0": status !== "loaded",
          }
        )}
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
      />
    </div>
  );
}

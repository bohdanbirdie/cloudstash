import { GlobeIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

interface FaviconProps {
  src: string | null | undefined;
  className?: string;
}

export function Favicon({ src, className }: FaviconProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src) return null;

  if (failedSrc === src) {
    return (
      <GlobeIcon
        aria-hidden="true"
        className={cn(
          "text-[color-mix(in_oklch,var(--muted-foreground)_60%,var(--background))]",
          className
        )}
      />
    );
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(src)}
      className={className}
    />
  );
}

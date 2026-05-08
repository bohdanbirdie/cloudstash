import { GlobeIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

interface FaviconProps {
  src: string | null | undefined;
  className?: string;
}

export function Favicon({ src, className }: FaviconProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src) return null;

  if (failed) {
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
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

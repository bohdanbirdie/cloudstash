import { ImageIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

interface LinkImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  iconClassName?: string;
  objectFit?: "cover" | "contain";
}

export function LinkImage({
  src,
  alt = "",
  className,
  iconClassName = "h-8 w-8",
  objectFit = "cover",
}: LinkImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = src && src !== failedSrc;

  return (
    <div
      className={cn(
        "aspect-video w-full overflow-hidden bg-muted flex items-center justify-center",
        className
      )}
    >
      {showImage ? (
        <img
          src={src}
          alt={alt}
          className={cn(
            objectFit === "cover"
              ? "h-full w-full object-cover"
              : "max-h-full max-w-full object-contain"
          )}
          onError={() => setFailedSrc(src ?? null)}
        />
      ) : (
        <ImageIcon className={cn("text-muted-foreground", iconClassName)} />
      )}
    </div>
  );
}

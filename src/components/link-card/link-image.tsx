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
  const [error, setError] = useState(false);
  const showImage = src && !error;

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
          onError={() => setError(true)}
        />
      ) : (
        <ImageIcon className={cn("text-muted-foreground", iconClassName)} />
      )}
    </div>
  );
}

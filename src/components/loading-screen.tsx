import { useEffect, useState } from "react";

import { LoginAnimation } from "@/components/login-animation";
import { cn } from "@/lib/utils";

export function LoadingScreen() {
  const [showSlowText, setShowSlowText] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowSlowText(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-6 animate-in fade-in duration-200">
      <LoginAnimation className="size-36" />
      <p
        className={cn(
          "text-sm text-muted-foreground transition-opacity duration-200",
          {
            "opacity-100": showSlowText,
            "opacity-0": !showSlowText,
          }
        )}
      >
        Syncing your data, hang tight…
      </p>
    </div>
  );
}

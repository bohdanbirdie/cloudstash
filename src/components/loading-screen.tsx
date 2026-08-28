import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import { LoginAnimation } from "@/components/login-animation";
import { TextEffect } from "@/components/ui/text-effect";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { cn } from "@/lib/utils";

export function LoadingState({
  message,
  className,
  animationClassName,
}: {
  message?: string;
  className?: string;
  animationClassName?: string;
}) {
  return (
    <div
      aria-busy="true"
      className={cn(
        "flex flex-col items-center justify-center gap-6",
        className
      )}
    >
      <LoginAnimation className={animationClassName ?? "size-36"} />
      <div role="status" className="min-h-5 text-sm">
        <AnimatePresence initial={false} mode="wait">
          {message ? <LoadingMessage key={message} message={message} /> : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

function LoadingMessage({ message }: { message: string }) {
  const [effectComplete, setEffectComplete] = useState(false);

  return (
    <motion.span
      key={message}
      className="relative inline-grid"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <TextEffect
        as="span"
        preset="fade"
        speedReveal={1.5}
        speedSegment={1.5}
        className={cn("col-start-1 row-start-1 text-muted-foreground", {
          "opacity-0": effectComplete,
        })}
        onAnimationComplete={() => setEffectComplete(true)}
      >
        {message}
      </TextEffect>
      <motion.span
        aria-hidden="true"
        className="col-start-1 row-start-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: effectComplete ? 1 : 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <TextShimmer as="span" duration={2.4} spread={1.5}>
          {message}
        </TextShimmer>
      </motion.span>
    </motion.span>
  );
}

export function LoadingScreen({
  message = "Syncing your library",
  className = "h-screen w-screen animate-in fade-in duration-200",
  animationClassName,
}: {
  message?: string;
  className?: string;
  animationClassName?: string;
}) {
  const [showSlowText, setShowSlowText] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowSlowText(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <LoadingState
      className={className}
      animationClassName={animationClassName}
      message={showSlowText ? message : undefined}
    />
  );
}

export function AccountLoadingScreen() {
  return <LoadingScreen message="Checking your account" />;
}

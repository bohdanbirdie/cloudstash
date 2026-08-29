"use client";
import React from "react";

import { cn } from "@/lib/utils";

export interface TextShimmerProps {
  children: string;
  as?: React.ElementType;
  className?: string;
  duration?: number;
  spread?: number;
}

function TextShimmerComponent({
  children,
  as: Component = "p",
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps) {
  const dynamicSpread = children.length * spread;

  return (
    <Component
      className={cn("text-shimmer", className)}
      style={
        {
          "--text-shimmer-duration": `${duration}s`,
          "--text-shimmer-spread": `${dynamicSpread}px`,
        } as React.CSSProperties
      }
    >
      <span className="text-shimmer__text">{children}</span>
      <span aria-hidden="true" className="text-shimmer__mask">
        {children}
      </span>
    </Component>
  );
}

export const TextShimmer = React.memo(TextShimmerComponent);

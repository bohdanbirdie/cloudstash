import "./styles.css";
import { RouterProvider } from "@tanstack/react-router";
import { MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { getRouter } from "./router";

const router = getRouter();
const root = document.querySelector("#root")!;

// We always createRoot rather than hydrateRoot. The prerendered HTML we ship
// for marketing routes is rendered by a hand-rolled, marketing-only router
// tree (scripts/prerender.tsx) that diverges structurally from this runtime
// tree — different root component (no HeadContent), no defaultPendingComponent,
// plus client-only Suspense/animation boundaries. Hydrating across that gap
// throws React #418 and discards the DOM anyway. createRoot keeps the
// prerendered HTML for SEO and first paint, then renders cleanly over it.
createRoot(root).render(
  <StrictMode>
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        errorRetryCount: 3,
        dedupingInterval: 10_000,
      }}
    >
      <TooltipProvider>
        <MotionConfig reducedMotion="user">
          <RouterProvider router={router} />
          <Toaster
            theme="light"
            position="top-center"
            offset={20}
            duration={5000}
            toastOptions={{
              classNames: {
                toast:
                  "group/toast flex !mx-auto !w-full !max-w-[min(22rem,calc(100vw-2rem))] items-center gap-3 !rounded-lg !border-0 !bg-popover !p-3 !font-sans !text-xs !text-popover-foreground !shadow-md ring-1 ring-foreground/10",
                content: "min-w-0",
                title: "!font-medium tracking-tight !text-foreground",
                description:
                  "mt-0.5 min-w-0 !text-muted-foreground tabular-nums",
                actionButton:
                  "shrink-0 !h-auto !rounded-none !bg-transparent !px-2 !py-1.5 !text-xs !font-medium !text-foreground/80 underline underline-offset-4 decoration-foreground/30 transition-colors hover:!text-foreground hover:decoration-foreground",
              },
            }}
          />
        </MotionConfig>
      </TooltipProvider>
    </SWRConfig>
  </StrictMode>
);

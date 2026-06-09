import "./styles.css";
import { RouterProvider } from "@tanstack/react-router";
import { MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";

import { Toaster } from "@/components/ui/sonner";

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
      <MotionConfig reducedMotion="user">
        <RouterProvider router={router} />
        <Toaster position="top-center" />
      </MotionConfig>
    </SWRConfig>
  </StrictMode>
);

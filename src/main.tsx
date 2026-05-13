import "./styles.css";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { SWRConfig } from "swr";

import { Toaster } from "@/components/ui/sonner";
import { PRERENDERED_PATHS } from "@/lib/prerendered-paths";

import { getRouter } from "./router";

const router = getRouter();
const root = document.querySelector("#root")!;

const tree = (
  <StrictMode>
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        errorRetryCount: 3,
        dedupingInterval: 10_000,
      }}
    >
      <RouterProvider router={router} />
      <Toaster position="top-center" />
    </SWRConfig>
  </StrictMode>
);

// Routes we ship as prerendered HTML get hydrateRoot so React reuses the
// existing DOM (no flash, no wasted first paint). Everything else hits
// the SPA fallback (which serves the prerendered landing's HTML) and
// must use createRoot — hydrating against the wrong route's DOM would
// throw mismatches.
const isPrerendered = (PRERENDERED_PATHS as readonly string[]).includes(
  window.location.pathname
);

if (isPrerendered) {
  hydrateRoot(root, tree);
} else {
  createRoot(root).render(tree);
}

// Workaround for Vite bug: SharedWorker entry points from node_modules hang during dev.
// Routing through a local file bypasses Vite's broken worker_file transform for node_modules.
// Related: https://github.com/vitejs/vite/issues/15359, https://github.com/vitejs/vite/issues/16214
//
// The module auto-calls makeWorker() on import — that's the actual entry point.
// We import and reference makeWorker to prevent Vite from tree-shaking the module.
import { makeWorker } from "@livestore/adapter-web/shared-worker";

// Prevent tree-shaking: Vite can't prove this has no side effects
if (typeof makeWorker !== "function") throw new Error("unreachable");

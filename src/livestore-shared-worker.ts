// Workaround for Vite bug: SharedWorker entry points from node_modules hang during dev.
// Routing through a local file bypasses Vite's broken worker_file transform for node_modules.
// Related: https://github.com/vitejs/vite/issues/15359, https://github.com/vitejs/vite/issues/16214
import "@livestore/adapter-web/shared-worker";

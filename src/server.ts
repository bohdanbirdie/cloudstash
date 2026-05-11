/// <reference types="@cloudflare/workers-types" />
import "@livestore/adapter-cloudflare/polyfill";
import type { CfTypes } from "@livestore/sync-cf/cf-worker";
import startHandler from "@tanstack/react-start/server-entry";

import type { LinkQueueMessage } from "./cf-worker/link-processor/types";
import type { Env } from "./cf-worker/shared";

// The livestore polyfill stubs `globalThis.document` with a partial shape.
// Sonner's CSS injection runs at module-eval and gates on
// `typeof document === 'undefined'` — without this delete it sees the stub,
// proceeds, then crashes on `style.appendChild(document.createTextNode(...))`.
// Livestore's server-side runtime never reads document, so dropping it is safe.
delete (globalThis as { document?: unknown }).document;

const isWorkerRoute = (pathname: string): boolean =>
  pathname.startsWith("/api/") ||
  pathname.startsWith("/agents/") ||
  pathname === "/sync" ||
  pathname.startsWith("/sync/");

// Lazy-load the cf-worker request/queue handlers so their import graph
// (Hono app + all handlers + livestore polyfill + defuddle, etc.) is only
// evaluated when an actual /api, /sync, /agents request hits — not at the
// Start SSR bundle's cold start.
const loadCfWorker = () => import("./cf-worker/index");

export default {
  async fetch(
    request: CfTypes.Request,
    env: Env,
    ctx: CfTypes.ExecutionContext
  ): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (isWorkerRoute(pathname)) {
      const { fetch } = await loadCfWorker();
      return fetch(request, env, ctx);
    }
    return startHandler.fetch(request as unknown as Request, {
      context: { env },
    });
  },

  async queue(batch: MessageBatch<LinkQueueMessage>, env: Env): Promise<void> {
    const { queue } = await loadCfWorker();
    await queue(batch, env);
  },
};

// Re-export Durable Objects and Workflow from their *source* modules (not via
// cf-worker/index.ts) so we don't drag the entire Hono app + handler import
// graph into the SSR bundle just to register class names.
export { SyncBackendDO } from "./cf-worker/sync";
export { LinkProcessorDO } from "./cf-worker/link-processor/durable-object";
export { ChatAgentDO } from "./cf-worker/chat-agent";
export { AccountDeletionWorkflow } from "./cf-worker/workflows/account-deletion";

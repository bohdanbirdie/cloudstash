/// <reference types="@cloudflare/workers-types" />
import "@livestore/adapter-cloudflare/polyfill";
import type { CfTypes } from "@livestore/sync-cf/cf-worker";
import { routeAgentRequest } from "agents";
import { Effect } from "effect";
import { Hono } from "hono";

import {
  handleGetOrgSettings,
  handleListWorkspaces,
  handleSetOverride,
  handleSetTier,
} from "./admin";
import { handleApproveUser } from "./admin/approve-user";
import { handleGetUsage } from "./admin/usage";
import { trackEvent } from "./analytics";
import { gateUserApiKeyCreate } from "./auth/api-key-gate";
import { AppLayerLive, AuthClient } from "./auth/service";
import { checkSyncAuth, SyncAuthError } from "./auth/sync-auth";
import { agentHooks } from "./chat-agent/hooks";
import { handleRaycastConnect, handleRaycastExchange } from "./connect/raycast";
import {
  handleTelegramCheck,
  handleTelegramConfirm,
  handleTelegramDisconnect,
  handleTelegramStatus,
} from "./connect/telegram";
import {
  handleXDisconnect,
  handleXPause,
  handleXResume,
  handleXStatus,
} from "./connect/x";
import { InviteId, OrgId, UserId } from "./db/branded";
import { ingestRequestToResponse } from "./ingest/service";
import {
  handleCreateInvite,
  handleDeleteInvite,
  handleListInvites,
  handleRedeemInvite,
} from "./invites";
import type { LinkQueueMessage } from "./link-processor/types";
import { logSync } from "./logger";
import { metadataRequestToResponse } from "./metadata/service";
import { requireAdmin } from "./middleware/require-admin";
import { handleGetMe, handleGetOrg } from "./org";
import { handleQueueBatch } from "./queue-handler";
import { runHandler } from "./runtime";
import type { Env, HonoVariables } from "./shared";
import { SyncBackend, handleSyncRequest } from "./sync";
import { handleTelegramWebhook } from "./telegram";
import { OtelTracingLive } from "./tracing";

export { SyncBackendDO } from "./sync";
export { LinkProcessorDO } from "./link-processor";
export { ChatAgentDO } from "./chat-agent";
export { XBookmarkSyncDO } from "./x-sync";
export { AccountDeletionWorkflow } from "./workflows/account-deletion";

const logger = logSync("API");

const RATE_LIMITED_PREFIXES = [
  "/sync",
  "/api/sync/",
  "/api/auth/",
  "/api/invites/redeem",
];

const isRateLimited = (pathname: string): boolean =>
  RATE_LIMITED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));

const checkRateLimit = async (
  request: CfTypes.Request,
  env: Env
): Promise<Response | null> => {
  const url = new URL(request.url);
  if (!isRateLimited(url.pathname)) return null;

  if (!env.SYNC_RATE_LIMITER) return null;

  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const { success } = await env.SYNC_RATE_LIMITER.limit({ key: ip });

  if (!success) {
    logger.warn("Rate limited", { ip, path: url.pathname });
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      headers: { "Content-Type": "application/json", "Retry-After": "60" },
      status: 429,
    });
  }

  return null;
};

const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

app.get("/api/auth/me", (c) => handleGetMe(c.req.raw, c.env));

app.get("/api/org/:id", (c) =>
  handleGetOrg(c.req.raw, OrgId.make(c.req.param("id")), c.env)
);

app.get("/api/org/:id/settings", requireAdmin, (c) =>
  handleGetOrgSettings(c.req.raw, OrgId.make(c.req.param("id")), c.env)
);
app.put("/api/org/:id/tier", requireAdmin, (c) =>
  handleSetTier(c.req.raw, OrgId.make(c.req.param("id")), c.env)
);
app.put("/api/org/:id/overrides", requireAdmin, (c) =>
  handleSetOverride(c.req.raw, OrgId.make(c.req.param("id")), c.env)
);
app.get("/api/admin/workspaces", requireAdmin, (c) =>
  handleListWorkspaces(c.req.raw, c.env)
);
app.post("/api/admin/users/:id/approve", requireAdmin, (c) =>
  handleApproveUser(c.req.raw, UserId.make(c.req.param("id")), c.env)
);
app.get("/api/admin/usage", requireAdmin, (c) =>
  handleGetUsage(c.req.raw, c.env)
);
app.on(["GET", "POST"], "/api/auth/*", (c) =>
  runHandler(
    c.env,
    Effect.gen(function* () {
      const denied = yield* gateUserApiKeyCreate(c.req.raw);
      if (denied) return denied;
      const auth = yield* AuthClient;
      return yield* Effect.promise(() => auth.handler(c.req.raw));
    })
  )
);

app.post("/api/invites", (c) => handleCreateInvite(c.req.raw, c.env));
app.get("/api/invites", (c) => handleListInvites(c.req.raw, c.env));
app.delete("/api/invites/:id", (c) =>
  handleDeleteInvite(c.req.raw, InviteId.make(c.req.param("id")), c.env)
);
app.post("/api/invites/redeem", (c) => handleRedeemInvite(c.req.raw, c.env));

app.get("/api/metadata", (c) =>
  Effect.runPromise(
    metadataRequestToResponse(c.req.raw).pipe(Effect.provide(OtelTracingLive))
  )
);

app.post("/api/ingest", (c) =>
  Effect.runPromise(ingestRequestToResponse(c.req.raw, c.env))
);

app.post("/api/connect/raycast", (c) => handleRaycastConnect(c.req.raw, c.env));
app.post("/api/connect/raycast/exchange", (c) =>
  handleRaycastExchange(c.req.raw, c.env)
);

app.get("/api/connect/telegram/check", (c) =>
  handleTelegramCheck(c.req.raw, c.env)
);
app.post("/api/connect/telegram/confirm", (c) =>
  handleTelegramConfirm(c.req.raw, c.env)
);
app.get("/api/connect/telegram/status", (c) =>
  handleTelegramStatus(c.req.raw, c.env)
);
app.delete("/api/connect/telegram", (c) =>
  handleTelegramDisconnect(c.req.raw, c.env)
);

app.get("/api/connect/x/status", (c) => handleXStatus(c.req.raw, c.env));
app.delete("/api/connect/x", (c) => handleXDisconnect(c.req.raw, c.env));
app.post("/api/connect/x/pause", (c) => handleXPause(c.req.raw, c.env));
app.post("/api/connect/x/resume", (c) => handleXResume(c.req.raw, c.env));

app.post("/api/telegram", (c) => handleTelegramWebhook(c.req.raw, c.env));

app.get("/api/sync/auth", async (c) => {
  const rawStoreId = c.req.query("storeId");
  if (!rawStoreId) {
    logger.warn("Sync auth missing storeId");
    return c.json({ error: "Missing storeId" }, 400);
  }

  const storeId = OrgId.make(rawStoreId);
  const cookie = c.req.header("cookie") ?? null;

  const result = await Effect.gen(function* () {
    const auth = yield* AuthClient;
    return yield* checkSyncAuth(cookie, storeId, auth).pipe(
      Effect.match({
        onFailure: (error) => error,
        onSuccess: (authData) => ({
          ok: true as const,
          userId: authData.userId,
        }),
      })
    );
  }).pipe(Effect.provide(AppLayerLive(c.env)), Effect.runPromise);

  if ("ok" in result) {
    logger.debug("Sync auth success");
    trackEvent(c.env.USAGE_ANALYTICS, {
      userId: result.userId,
      event: "sync_auth",
      orgId: storeId,
    });
    return c.json({ ok: result.ok });
  }
  logger.info("Sync auth failed", { code: result.code, status: result.status });
  return c.json(result, result.status as 401 | 403);
});

const handleSync = async (
  request: CfTypes.Request,
  env: Env,
  ctx: CfTypes.ExecutionContext
): Promise<Response> => {
  const searchParams = SyncBackend.matchSyncRequest(request);

  if (!searchParams) {
    logger.warn("Invalid sync request");
    return new Response(JSON.stringify({ error: "Invalid sync request" }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    });
  }

  const cookie = request.headers.get("cookie");
  const syncStoreId = OrgId.make(searchParams.storeId);

  const authResult = await Effect.gen(function* () {
    const auth = yield* AuthClient;
    return yield* checkSyncAuth(cookie, syncStoreId, auth).pipe(
      Effect.match({
        onFailure: (error) => error,
        onSuccess: (result) => result,
      })
    );
  }).pipe(Effect.provide(AppLayerLive(env)), Effect.runPromise);

  if (authResult instanceof SyncAuthError) {
    logger.info("Sync auth rejected", {
      code: authResult.code,
      status: authResult.status,
    });
    return new Response(JSON.stringify(authResult), {
      headers: { "Content-Type": "application/json" },
      status: authResult.status,
    });
  }

  trackEvent(env.USAGE_ANALYTICS, {
    userId: authResult.userId,
    event: "sync",
    orgId: searchParams.storeId,
  });

  return handleSyncRequest(
    request,
    searchParams,
    ctx,
    env
  ) as unknown as Response;
};

export const fetch = async (
  request: CfTypes.Request,
  env: Env,
  ctx: CfTypes.ExecutionContext
): Promise<Response> => {
  const rateLimited = await checkRateLimit(request, env);
  if (rateLimited) return rateLimited;

  const url = new URL(request.url);

  // Handle agent WebSocket connections (/agents/:agent/:name)
  const agentResponse = await routeAgentRequest(
    request as unknown as Request,
    env,
    {
      onBeforeConnect: (req, lobby) =>
        agentHooks.onBeforeConnect(req, lobby, env),
      onBeforeRequest: (req, lobby) =>
        agentHooks.onBeforeRequest(req, lobby, env),
    }
  );
  if (agentResponse) return agentResponse;

  if (url.pathname === "/sync") {
    return handleSync(request, env, ctx);
  }

  return app.fetch(request as unknown as Request, env, ctx);
};

export const queue = async (
  batch: MessageBatch<LinkQueueMessage>,
  env: Env
): Promise<void> => {
  await handleQueueBatch(batch, env);
};

export default { fetch, queue };

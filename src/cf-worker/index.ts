/// <reference types="@cloudflare/workers-types" />
import "@livestore/adapter-cloudflare/polyfill";
import { type CfTypes } from "@livestore/sync-cf/cf-worker";
import { routeAgentRequest } from "agents";
import { Effect } from "effect";
import { Hono } from "hono";

import {
  handleGetOrgSettings,
  handleListWorkspaces,
  handleUpdateOrgSettings,
} from "./admin";
import { handleApproveUser } from "./admin/approve-user";
import { handleGetUsage } from "./admin/usage";
import { trackEvent } from "./analytics";
import { createAuth } from "./auth";
import { checkSyncAuth, SyncAuthError } from "./auth/sync-auth";
import { agentHooks } from "./chat-agent/hooks";
import { createDb } from "./db";
import { ingestRequestToResponse } from "./ingest/service";
import {
  handleCreateInvite,
  handleDeleteInvite,
  handleListInvites,
  handleRedeemInvite,
} from "./invites";
import { addToWideEvent, wideEventMiddleware } from "./logging/middleware";
import { metadataRequestToResponse } from "./metadata/service";
import { requireAdmin } from "./middleware/require-admin";
import { handleGetMe, handleGetOrg } from "./org";
import { type Env, type HonoVariables } from "./shared";
import { SyncBackend, handleSyncRequest } from "./sync";
import { handleTelegramWebhook } from "./telegram";

export { SyncBackendDO } from "./sync";
export { LinkProcessorDO } from "./link-processor";
export { ChatAgentDO } from "./chat-agent";

const RATE_LIMITED_PREFIXES = ["/sync", "/api/sync/", "/api/auth/"];

const isRateLimited = (pathname: string): boolean =>
  RATE_LIMITED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));

const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

app.use("/api/*", wideEventMiddleware);

app.use("/api/*", async (c, next) => {
  const url = new URL(c.req.url);
  if (!isRateLimited(url.pathname)) {
    return next();
  }

  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  const { success } = await c.env.SYNC_RATE_LIMITER.limit({ key: ip });

  if (!success) {
    addToWideEvent(c, { rateLimited: true, ip });
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  return next();
});

app.get("/api/auth/me", (c) => handleGetMe(c.req.raw, c.env));

app.get("/api/org/:id", (c) =>
  handleGetOrg(c.req.raw, c.req.param("id"), c.env)
);

app.get("/api/org/:id/settings", requireAdmin, (c) =>
  handleGetOrgSettings(c.req.raw, c.req.param("id"), c.env)
);
app.put("/api/org/:id/settings", requireAdmin, (c) =>
  handleUpdateOrgSettings(c.req.raw, c.req.param("id"), c.env)
);
app.get("/api/admin/workspaces", requireAdmin, (c) =>
  handleListWorkspaces(c.req.raw, c.env)
);
app.post("/api/admin/users/:id/approve", requireAdmin, (c) =>
  handleApproveUser(c.req.raw, c.req.param("id"), c.env)
);
app.get("/api/admin/usage", requireAdmin, (c) =>
  handleGetUsage(c.req.raw, c.env)
);

app.on(["GET", "POST"], "/api/auth/*", (c) => {
  const db = createDb(c.env.DB);
  const auth = createAuth(c.env, db);
  return auth.handler(c.req.raw);
});

app.post("/api/invites", (c) => handleCreateInvite(c.req.raw, c.env));
app.get("/api/invites", (c) => handleListInvites(c.req.raw, c.env));
app.delete("/api/invites/:id", (c) =>
  handleDeleteInvite(c.req.raw, c.req.param("id"), c.env)
);
app.post("/api/invites/redeem", (c) => handleRedeemInvite(c.req.raw, c.env));

app.get("/api/metadata", (c) =>
  Effect.runPromise(metadataRequestToResponse(c.req.raw))
);

app.post("/api/ingest", (c) =>
  Effect.runPromise(ingestRequestToResponse(c.req.raw, c.env))
);

app.post("/api/telegram", (c) => handleTelegramWebhook(c.req.raw, c.env));

app.get("/api/sync/auth", async (c) => {
  const storeId = c.req.query("storeId");
  if (!storeId) {
    addToWideEvent(c, { syncAuth: "missing_store_id" });
    return c.json({ error: "Missing storeId" }, 400);
  }

  addToWideEvent(c, { orgId: storeId });

  const db = createDb(c.env.DB);
  const auth = createAuth(c.env, db);
  const cookie = c.req.header("cookie") ?? null;

  const result = await checkSyncAuth(cookie, storeId, auth).pipe(
    Effect.match({
      onFailure: (error) => error,
      onSuccess: (authData) => ({ ok: true as const, userId: authData.userId }),
    }),
    Effect.runPromise
  );

  if ("ok" in result) {
    addToWideEvent(c, { syncAuth: "success", userId: result.userId });
    trackEvent(c.env.USAGE_ANALYTICS, {
      userId: result.userId,
      event: "sync_auth",
      orgId: storeId,
    });
    return c.json({ ok: result.ok });
  }
  addToWideEvent(c, {
    syncAuth: "failed",
    authErrorCode: result.code,
    authErrorStatus: result.status,
  });
  return c.json(result, result.status as 401 | 403);
});

const handleSync = async (
  request: CfTypes.Request,
  env: Env,
  ctx: CfTypes.ExecutionContext
): Promise<Response> => {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  const url = new URL(request.url);

  const emitSyncEvent = (fields: Record<string, unknown>) => {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        requestId,
        service: "cloudstash-worker",
        method: request.method,
        path: url.pathname,
        region: (request.cf?.colo as string) ?? "unknown",
        durationMs: Date.now() - startTime,
        ...fields,
      })
    );
  };

  const searchParams = SyncBackend.matchSyncRequest(request);

  if (!searchParams) {
    emitSyncEvent({
      outcome: "error",
      statusCode: 400,
      error: "invalid_sync_request",
    });
    return new Response(JSON.stringify({ error: "Invalid sync request" }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    });
  }

  const db = createDb(env.DB);
  const auth = createAuth(env, db);
  const cookie = request.headers.get("cookie");

  const authResult = await checkSyncAuth(
    cookie,
    searchParams.storeId,
    auth
  ).pipe(
    Effect.match({
      onFailure: (error) => error,
      onSuccess: (result) => result,
    }),
    Effect.runPromise
  );

  if (authResult instanceof SyncAuthError) {
    emitSyncEvent({
      outcome: "error",
      statusCode: authResult.status,
      authErrorCode: authResult.code,
      orgId: searchParams.storeId,
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

  emitSyncEvent({
    outcome: "success",
    statusCode: 101,
    userId: authResult.userId,
    orgId: searchParams.storeId,
  });

  return handleSyncRequest(
    request,
    searchParams,
    ctx,
    env
  ) as unknown as Response;
};

export default {
  async fetch(
    request: CfTypes.Request,
    env: Env,
    ctx: CfTypes.ExecutionContext
  ) {
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

    // Handle /sync path separately (rate limiting handled in handleSync)
    if (url.pathname === "/sync") {
      // Check rate limit for sync
      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      const { success } = await env.SYNC_RATE_LIMITER.limit({ key: ip });
      if (!success) {
        console.log(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            service: "cloudstash-worker",
            path: "/sync",
            outcome: "rate_limited",
            statusCode: 429,
            ip,
          })
        );
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          headers: { "Content-Type": "application/json", "Retry-After": "60" },
          status: 429,
        });
      }
      return handleSync(request, env, ctx);
    }

    return app.fetch(request as unknown as Request, env, ctx);
  },
};

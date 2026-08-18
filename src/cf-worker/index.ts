/// <reference types="@cloudflare/workers-types" />
import "@livestore/adapter-cloudflare/polyfill";
import type { CfTypes } from "@livestore/sync-cf/cf-worker";
import { routeAgentRequest } from "agents";
import { Effect, Match } from "effect";
import { Hono } from "hono";

import { PERMISSIONS } from "@/lib/permissions";

import {
  handleGetOrgSettings,
  handleListWorkspaces,
  handleSetOverride,
  handleSetTier,
} from "./admin";
import { handleGetActivityStats } from "./admin/activity-stats/handler";
import { handleApproveUser } from "./admin/approve-user";
import { handleGetSignupGate, handleSetSignupGate } from "./admin/signup-gate";
import { handleTriggerDigest } from "./admin/trigger-digest";
import { handleGetUsage } from "./admin/usage";
import { trackEvent } from "./analytics";
import { gateUserApiKeyCreate } from "./auth/api-key-gate";
import {
  monitorOAuthClientGrowth,
  validateOAuthClientRegistrationRequest,
} from "./auth/oauth-client-registration";
import {
  bindConsentWorkspace,
  validateConsentWorkspaceBinding,
} from "./auth/oauth-consent-binding";
import { handleOAuthMetadataRequest } from "./auth/oauth-metadata";
import { AppLayerLive, AuthClient } from "./auth/service";
import { checkSyncAuth } from "./auth/sync-auth";
import { handleBillingCheckout } from "./billing/routes/checkout";
import { handleBillingPortal } from "./billing/routes/portal";
import { handleStripeSuccess } from "./billing/routes/success";
import { handleStripeWebhook } from "./billing/routes/webhook";
import { agentHooks } from "./chat-agent/hooks";
import {
  handleExtensionAccount,
  handleExtensionConnect,
  handleExtensionDisconnect,
} from "./connect/extension";
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
import { handleListLinks } from "./links/handler";
import { logSync } from "./logger";
import { handleMcpRequest } from "./mcp/server";
import { metadataRequestToResponse } from "./metadata/service";
import { requirePermission } from "./middleware/authorize";
import { handleGetMe, handleGetOrg } from "./org";
import { handleDlqBatch, handleQueueBatch } from "./queue-handler";
import { routeAgentBeforeMcp } from "./request-routing";
import { runHandler } from "./runtime";
import type { Env, HonoVariables } from "./shared";
import { SyncBackend, handleSyncRequest, runSyncAuth } from "./sync";
import { handleTelegramWebhook } from "./telegram";

export { SyncBackendDO } from "./sync";
export { LinkProcessorDO } from "./link-processor";
export { ChatAgentDO } from "./chat-agent";
export { XBookmarkSyncDO } from "./x-sync";
export { AccountDeletionWorkflow } from "./workflows/account-deletion";

const logger = logSync("API");

logger.debug("livestore build", { build: __LIVESTORE_BUILD__ });

const RATE_LIMITED_PREFIXES = [
  "/mcp",
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

app.on(["GET", "HEAD", "OPTIONS"], "/.well-known/*", (c) => {
  if (c.req.method === "OPTIONS")
    return handleOAuthMetadataRequest(c.req.raw, c.env, () =>
      Promise.reject(new Error("OPTIONS must not call Better Auth"))
    );
  return runHandler(
    c.env,
    Effect.gen(function* () {
      const auth = yield* AuthClient;
      return yield* Effect.promise(() =>
        handleOAuthMetadataRequest(c.req.raw, c.env, (request) =>
          auth.handler(request)
        )
      );
    }).pipe(Effect.withSpan("API.authMetadataHandler"))
  );
});

app.get("/api/org/:id", (c) =>
  handleGetOrg(c.req.raw, OrgId.make(c.req.param("id")), c.env)
);

app.get(
  "/api/org/:id/settings",
  requirePermission(PERMISSIONS.viewDashboard),
  (c) => handleGetOrgSettings(c.req.raw, OrgId.make(c.req.param("id")), c.env)
);
app.put(
  "/api/org/:id/tier",
  requirePermission(PERMISSIONS.manageBilling),
  (c) => handleSetTier(c.req.raw, OrgId.make(c.req.param("id")), c.env)
);
app.put(
  "/api/org/:id/overrides",
  requirePermission(PERMISSIONS.manageBilling),
  (c) => handleSetOverride(c.req.raw, OrgId.make(c.req.param("id")), c.env)
);
app.get(
  "/api/admin/workspaces",
  requirePermission(PERMISSIONS.viewDashboard),
  (c) => handleListWorkspaces(c.req.raw, c.env)
);
app.post(
  "/api/admin/users/:id/approve",
  requirePermission(PERMISSIONS.manageMembers),
  (c) => handleApproveUser(UserId.make(c.req.param("id")), c.env)
);
app.get("/api/admin/usage", requirePermission(PERMISSIONS.viewDashboard), (c) =>
  handleGetUsage(c.req.raw, c.env)
);
app.get(
  "/api/admin/activity",
  requirePermission(PERMISSIONS.viewDashboard),
  (c) => handleGetActivityStats(c.req.raw, c.env)
);
app.get(
  "/api/admin/signup-gate",
  requirePermission(PERMISSIONS.viewDashboard),
  (c) => handleGetSignupGate(c.req.raw, c.env)
);
app.put(
  "/api/admin/signup-gate",
  requirePermission(PERMISSIONS.manageSystem),
  (c) => handleSetSignupGate(c.req.raw, c.env)
);
app.post(
  "/api/weekly-digest/trigger",
  requirePermission(PERMISSIONS.manageSystem),
  (c) => handleTriggerDigest(c.req.raw, c.env)
);
app.on(["GET", "POST"], "/api/auth/*", (c) =>
  runHandler(
    c.env,
    Effect.gen(function* () {
      const invalidRegistration = yield* validateOAuthClientRegistrationRequest(
        c.req.raw
      );
      if (invalidRegistration) return invalidRegistration;
      const denied = yield* gateUserApiKeyCreate(c.req.raw);
      if (denied) return denied;
      const auth = yield* AuthClient;
      const invalidConsent = yield* validateConsentWorkspaceBinding(
        c.req.raw,
        auth,
        c.env
      );
      if (invalidConsent) return invalidConsent;
      const response = yield* Effect.promise(() => auth.handler(c.req.raw));
      yield* monitorOAuthClientGrowth(c.req.raw, response);
      return yield* bindConsentWorkspace(response, c.req.raw, auth, c.env);
    }).pipe(Effect.withSpan("API.authHandler"))
  )
);

app.post("/api/invites", (c) => handleCreateInvite(c.req.raw, c.env));
app.get("/api/invites", (c) => handleListInvites(c.req.raw, c.env));
app.delete("/api/invites/:id", (c) =>
  handleDeleteInvite(c.req.raw, InviteId.make(c.req.param("id")), c.env)
);
app.post("/api/invites/redeem", (c) => handleRedeemInvite(c.req.raw, c.env));

app.get("/api/metadata", (c) =>
  runHandler(
    c.env,
    metadataRequestToResponse(
      c.req.raw,
      c.env.METADATA_RATE_LIMITER,
      new URL(c.env.BETTER_AUTH_URL).hostname
    )
  )
);

app.post("/api/ingest", (c) =>
  Effect.runPromise(ingestRequestToResponse(c.req.raw, c.env))
);

app.get("/api/links", (c) => handleListLinks(c.req.raw, c.env));

app.post("/api/connect/raycast", (c) => handleRaycastConnect(c.req.raw, c.env));
app.post("/api/connect/raycast/exchange", (c) =>
  handleRaycastExchange(c.req.raw, c.env)
);

app.post("/api/connect/extension", (c) =>
  handleExtensionConnect(c.req.raw, c.env)
);
app.delete("/api/connect/extension", (c) =>
  handleExtensionDisconnect(c.req.raw, c.env)
);
app.get("/api/connect/extension/account", (c) =>
  handleExtensionAccount(c.req.raw, c.env)
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

app.post("/api/billing/checkout", (c) =>
  handleBillingCheckout(c.req.raw, c.env)
);
app.post("/api/billing/portal", (c) => handleBillingPortal(c.req.raw, c.env));
app.get("/api/stripe/success", (c) => handleStripeSuccess(c.req.raw, c.env));
app.post("/api/stripe/webhook", (c) => handleStripeWebhook(c.req.raw, c.env));

app.post("/api/telegram", (c) => handleTelegramWebhook(c.req.raw, c.env));

app.get("/api/sync/auth", async (c) => {
  const rawStoreId = c.req.query("storeId");
  if (!rawStoreId) {
    logger.warn("Sync auth missing storeId");
    return c.json({ error: "Missing storeId" }, 400);
  }

  const storeId = OrgId.make(rawStoreId);
  const cookie = c.req.header("cookie") ?? null;

  const result = await checkSyncAuth(cookie, storeId).pipe(
    Effect.match({
      onFailure: (error) => error,
      onSuccess: (authData) => ({
        ok: true as const,
        userId: authData.userId,
      }),
    }),
    Effect.withSpan("API.syncAuth"),
    Effect.provide(AppLayerLive(c.env)),
    Effect.runPromise
  );

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
  return c.json(result, result.status as 401 | 403 | 503);
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

  const authResult = await runSyncAuth(
    searchParams.payload,
    searchParams.storeId,
    request.headers as unknown as Headers,
    env
  );

  if (authResult instanceof Response) {
    logger.info("Sync auth rejected", { status: authResult.status });
    return authResult;
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

  // ChatAgent routing remains authoritative for /agents before MCP dispatch.
  const agentOrMcpResponse = await routeAgentBeforeMcp(
    request as unknown as Request,
    () =>
      routeAgentRequest(request as unknown as Request, env, {
        onBeforeConnect: (req, lobby) =>
          agentHooks.onBeforeConnect(req, lobby, env),
        onBeforeRequest: (req, lobby) =>
          agentHooks.onBeforeRequest(req, lobby, env),
      }),
    () => handleMcpRequest(request as unknown as Request, env)
  );
  if (agentOrMcpResponse) return agentOrMcpResponse;

  if (url.pathname === "/sync") {
    return handleSync(request, env, ctx);
  }

  if (url.pathname === "/") {
    return env.ASSETS.fetch(
      new Request(new URL("/__landing.html", url))
    ) as unknown as Promise<Response>;
  }

  return app.fetch(request as unknown as Request, env, ctx);
};

export const queue = (
  batch: MessageBatch<LinkQueueMessage>,
  env: Env
): Promise<void> =>
  Match.value(batch.queue).pipe(
    Match.when("cloudstash-link-queue", () => handleQueueBatch(batch, env)),
    Match.when("cloudstash-link-dlq", () => handleDlqBatch(batch, env)),
    // Returning without retrying would implicitly ack (drop) an unmatched queue's batch.
    Match.orElse(() => Promise.resolve(batch.retryAll()))
  );

export default { fetch, queue };

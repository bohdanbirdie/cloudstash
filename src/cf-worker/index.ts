/// <reference types="@cloudflare/workers-types" />
import "@livestore/adapter-cloudflare/polyfill";
import { type CfTypes } from "@livestore/sync-cf/cf-worker";
import { Effect } from "effect";
import { Hono } from "hono";

import {
  handleGetOrgSettings,
  handleListWorkspaces,
  handleUpdateOrgSettings,
} from "./admin";
import { createAuth } from "./auth";
import { checkSyncAuth, SyncAuthError } from "./auth/sync-auth";
import { createDb } from "./db";
import { ingestRequestToResponse } from "./ingest/service";
import {
  handleCreateInvite,
  handleDeleteInvite,
  handleListInvites,
  handleRedeemInvite,
} from "./invites";
import { logSync } from "./logger";
import { metadataRequestToResponse } from "./metadata/service";
import { requireAdmin } from "./middleware/require-admin";
import { handleGetMe, handleGetOrg } from "./org";
import { type Env, type HonoVariables } from "./shared";
import { SyncBackend, handleSyncRequest } from "./sync";
import { handleTelegramWebhook } from "./telegram";

export { SyncBackendDO } from "./sync";
export { LinkProcessorDO } from "./link-processor";

const logger = logSync("API");

const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

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
    logger.warn("Sync auth missing storeId");
    return c.json({ error: "Missing storeId" }, 400);
  }

  const db = createDb(c.env.DB);
  const auth = createAuth(c.env, db);
  const cookie = c.req.header("cookie") ?? null;

  const result = await checkSyncAuth(cookie, storeId, auth).pipe(
    Effect.match({
      onFailure: (error) => error,
      onSuccess: () => ({ ok: true as const }),
    }),
    Effect.runPromise
  );

  if ("ok" in result) {
    logger.debug("Sync auth success");
    return c.json(result);
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
      onSuccess: () => null,
    }),
    Effect.runPromise
  );

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

    if (url.pathname === "/sync") {
      return handleSync(request, env, ctx);
    }

    return app.fetch(request as unknown as Request, env, ctx);
  },
};

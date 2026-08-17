import { it, describe } from "@effect/vitest";
import { Effect, Layer, References } from "effect";
import { expect, vi } from "vitest";

import type { TierCapabilities } from "@/lib/plan";

import { AuthClient } from "../../auth/service";
import {
  WorkspaceAccess,
  makeWorkspaceAccess,
} from "../../auth/workspace-access";
import { Billing } from "../../billing/service";
import { OrgId, UserId } from "../../db/branded";
import { DbError } from "../../db/service";
import {
  enqueueLink,
  handleIngestRequest,
  ingestResponse,
} from "../../ingest/service";
import { OrgNotFoundError } from "../../org/errors";

function createRequest(
  body: unknown,
  headers: Record<string, string> = {}
): Request {
  return new Request("https://api.test/api/ingest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function createEnv(overrides: { queueSendError?: Error } = {}) {
  const queueSend = overrides.queueSendError
    ? vi.fn().mockRejectedValue(overrides.queueSendError)
    : vi.fn().mockResolvedValue(undefined);

  return {
    DB: {},
    BETTER_AUTH_SECRET: "test",
    BETTER_AUTH_URL: "http://localhost",
    GOOGLE_CLIENT_ID: "test",
    GOOGLE_CLIENT_SECRET: "test",
    LINK_QUEUE: { send: queueSend },
    USAGE_ANALYTICS: { writeDataPoint: vi.fn() },
    _queueSend: queueSend,
  };
}

function makeAuthLayer(
  verifyApiKey: (opts: {
    body: { key: string };
  }) => Promise<{ valid: boolean; key: unknown }>
) {
  const authLayer = Layer.succeed(AuthClient, {
    api: { verifyApiKey },
  } as unknown as AuthClient["Service"]);
  const accessLayer = Layer.effect(
    WorkspaceAccess,
    Effect.map(AuthClient, (auth) =>
      makeWorkspaceAccess(auth, {
        query: {
          user: { findFirst: () => Promise.resolve({ approved: true }) },
          member: { findFirst: () => Promise.resolve({ id: "member-1" }) },
        },
      } as never)
    )
  ).pipe(Layer.provide(authLayer));
  return Layer.merge(authLayer, accessLayer);
}

function makeBillingLayer(
  capabilities: Billing["Service"]["capabilities"]
): Layer.Layer<Billing> {
  return Layer.succeed(Billing, {
    capabilities,
  } as unknown as Billing["Service"]);
}

const capsLayer = (publicApi: boolean): Layer.Layer<Billing> =>
  makeBillingLayer(() => Effect.succeed({ publicApi } as TierCapabilities));

const plusBillingLayer = capsLayer(true);

function run(
  request: Request,
  env: ReturnType<typeof createEnv>,
  authLayer: Layer.Layer<AuthClient | WorkspaceAccess>,
  billingLayer: Layer.Layer<Billing> = plusBillingLayer
) {
  return ingestResponse(
    handleIngestRequest(request, env as never).pipe(
      Effect.provide(Layer.mergeAll(authLayer, billingLayer))
    )
  ).pipe(Effect.provideService(References.MinimumLogLevel, "Error"));
}

const validKeyResponse = {
  valid: true,
  key: { metadata: { orgId: "org-1" }, referenceId: "user-1" },
};

const validAuthLayer = makeAuthLayer(() => Promise.resolve(validKeyResponse));

describe("enqueueLink", () => {
  it.effect("queues an MCP save_link with its workspace and source", () => {
    const env = createEnv();

    return enqueueLink(
      { orgId: OrgId.make("org-1"), userId: UserId.make("user-1") },
      "https://example.com",
      "mcp",
      env as never
    ).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(env._queueSend).toHaveBeenCalledWith({
            source: "mcp",
            sourceMeta: null,
            storeId: "org-1",
            url: "https://example.com",
          });
          expect(env.USAGE_ANALYTICS.writeDataPoint).toHaveBeenCalledOnce();
        })
      )
    );
  });
});

describe("ingestRequestToResponse", () => {
  it.effect("returns 401 when Authorization header is missing", () => {
    const request = createRequest({ url: "https://example.com" });
    const env = createEnv();

    return run(request, env, validAuthLayer).pipe(
      Effect.tap((response) =>
        Effect.promise(async () => {
          expect(response.status).toBe(401);
          expect(await response.json()).toEqual({ error: "Missing API key" });
        })
      )
    );
  });

  it.effect("returns 401 when Authorization header has wrong format", () => {
    const request = createRequest(
      { url: "https://example.com" },
      { Authorization: "Basic abc123" }
    );
    const env = createEnv();

    return run(request, env, validAuthLayer).pipe(
      Effect.tap((response) =>
        Effect.promise(async () => {
          expect(response.status).toBe(401);
          expect(await response.json()).toEqual({ error: "Missing API key" });
        })
      )
    );
  });

  it.effect("returns 401 when API key is invalid", () => {
    const authLayer = makeAuthLayer(() =>
      Promise.resolve({ valid: false, key: null })
    );

    const request = createRequest(
      { url: "https://example.com" },
      { Authorization: "Bearer bad-key" }
    );
    const env = createEnv();

    return run(request, env, authLayer).pipe(
      Effect.tap((response) =>
        Effect.promise(async () => {
          expect(response.status).toBe(401);
          expect(await response.json()).toEqual({ error: "Invalid API key" });
        })
      )
    );
  });

  it.effect("returns 503 when verifyApiKey throws an error", () => {
    const authLayer = makeAuthLayer(() =>
      Promise.reject(new Error("Invalid API key."))
    );

    const request = createRequest(
      { url: "https://example.com" },
      { Authorization: "Bearer bad-key" }
    );
    const env = createEnv();

    return run(request, env, authLayer).pipe(
      Effect.tap((response) =>
        Effect.promise(async () => {
          expect(response.status).toBe(503);
          expect(await response.json()).toEqual({
            error: "Auth backend unavailable",
          });
        })
      )
    );
  });

  it.effect("returns 401 when API key is missing orgId", () => {
    const authLayer = makeAuthLayer(() =>
      Promise.resolve({ valid: true, key: { metadata: {} } })
    );

    const request = createRequest(
      { url: "https://example.com" },
      { Authorization: "Bearer valid-key" }
    );
    const env = createEnv();

    return run(request, env, authLayer).pipe(
      Effect.tap((response) =>
        Effect.promise(async () => {
          expect(response.status).toBe(401);
          expect(await response.json()).toEqual({
            error: "API key missing orgId metadata",
          });
        })
      )
    );
  });

  it.effect("returns 400 when request body has no url", () => {
    const request = createRequest({}, { Authorization: "Bearer valid-key" });
    const env = createEnv();

    return run(request, env, validAuthLayer).pipe(
      Effect.tap((response) =>
        Effect.promise(async () => {
          expect(response.status).toBe(400);
          expect(await response.json()).toEqual({ error: "Missing url" });
        })
      )
    );
  });

  it.effect("returns 400 when url is invalid", () => {
    const request = createRequest(
      { url: "not-a-url" },
      { Authorization: "Bearer valid-key" }
    );
    const env = createEnv();

    return run(request, env, validAuthLayer).pipe(
      Effect.tap((response) =>
        Effect.promise(async () => {
          expect(response.status).toBe(400);
          expect(await response.json()).toEqual({ error: "Invalid URL" });
        })
      )
    );
  });

  it.effect("returns 500 when queue send fails", () => {
    const request = createRequest(
      { url: "https://example.com" },
      { Authorization: "Bearer valid-key" }
    );
    const env = createEnv({
      queueSendError: new Error("Queue unavailable"),
    });

    return run(request, env, validAuthLayer).pipe(
      Effect.tap((response) =>
        Effect.promise(async () => {
          expect(response.status).toBe(500);
          expect(await response.json()).toEqual({
            error: "Queue send failed",
          });
        })
      )
    );
  });

  it.effect("returns 402 and does not queue when org lacks publicApi", () => {
    const request = createRequest(
      { url: "https://example.com" },
      { Authorization: "Bearer valid-key" }
    );
    const env = createEnv();

    return run(request, env, validAuthLayer, capsLayer(false)).pipe(
      Effect.tap((response) =>
        Effect.promise(async () => {
          expect(response.status).toBe(402);
          expect(await response.json()).toEqual({
            error: "Upgrade required",
            capability: "publicApi",
            requiredTier: "plus",
          });
          expect(env._queueSend).not.toHaveBeenCalled();
        })
      )
    );
  });

  it.effect("returns 500 and does not queue when the org lookup errors", () => {
    const request = createRequest(
      { url: "https://example.com" },
      { Authorization: "Bearer valid-key" }
    );
    const env = createEnv();
    const billingLayer = makeBillingLayer(() => new DbError({ cause: "boom" }));

    return run(request, env, validAuthLayer, billingLayer).pipe(
      Effect.tap((response) =>
        Effect.promise(async () => {
          expect(response.status).toBe(500);
          expect(await response.json()).toEqual({ error: "Internal error" });
          expect(env._queueSend).not.toHaveBeenCalled();
        })
      )
    );
  });

  it.effect(
    "returns 404 and does not queue when the org no longer exists",
    () => {
      const request = createRequest(
        { url: "https://example.com" },
        { Authorization: "Bearer valid-key" }
      );
      const env = createEnv();
      const billingLayer = makeBillingLayer((orgId) =>
        OrgNotFoundError.make({ orgId })
      );

      return run(request, env, validAuthLayer, billingLayer).pipe(
        Effect.tap((response) =>
          Effect.promise(async () => {
            expect(response.status).toBe(404);
            expect(await response.json()).toEqual({
              error: "Organization not found",
            });
            expect(env._queueSend).not.toHaveBeenCalled();
          })
        )
      );
    }
  );

  it.effect("returns 200 and queues link on success", () => {
    const request = createRequest(
      { url: "https://example.com" },
      { Authorization: "Bearer valid-key" }
    );
    const env = createEnv();

    return run(request, env, validAuthLayer).pipe(
      Effect.tap((response) =>
        Effect.promise(async () => {
          expect(response.status).toBe(200);
          expect(await response.json()).toEqual({ status: "queued" });
          expect(env._queueSend).toHaveBeenCalledWith({
            source: "api",
            sourceMeta: null,
            storeId: "org-1",
            url: "https://example.com",
          });
        })
      )
    );
  });
});

import { it, describe } from "@effect/vitest";
import { Effect, Layer, LogLevel, Logger } from "effect";
import { expect, vi } from "vitest";

import { AuthClient } from "../../auth/service";
import { handleIngestRequest } from "../../ingest/service";

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
  return Layer.succeed(AuthClient, {
    api: { verifyApiKey },
  } as unknown as AuthClient["Type"]);
}

function run(
  request: Request,
  env: ReturnType<typeof createEnv>,
  authLayer: Layer.Layer<AuthClient>
) {
  return handleIngestRequest(request, env as never).pipe(
    Effect.provide(authLayer),
    Effect.map(({ result, ok }) =>
      Response.json(result, { status: ok ? 200 : 400 })
    ),
    Effect.catchTags({
      IngestInvalidApiKeyError: () =>
        Effect.succeed(
          Response.json({ error: "Invalid API key" }, { status: 401 })
        ),
      IngestInvalidUrlError: () =>
        Effect.succeed(
          Response.json({ error: "Invalid URL" }, { status: 400 })
        ),
      IngestMissingApiKeyError: () =>
        Effect.succeed(
          Response.json({ error: "Missing API key" }, { status: 401 })
        ),
      IngestMissingOrgIdError: () =>
        Effect.succeed(
          Response.json(
            { error: "API key missing orgId metadata" },
            { status: 401 }
          )
        ),
      IngestMissingUrlError: () =>
        Effect.succeed(
          Response.json({ error: "Missing url" }, { status: 400 })
        ),
    }),
    Effect.catchAll(() =>
      Effect.succeed(
        Response.json({ error: "Queue send failed" }, { status: 500 })
      )
    ),
    Logger.withMinimumLogLevel(LogLevel.Error)
  );
}

const validKeyResponse = {
  valid: true,
  key: { metadata: { orgId: "org-1" }, referenceId: "user-1" },
};

const validAuthLayer = makeAuthLayer(() => Promise.resolve(validKeyResponse));

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

  it.effect("returns 401 when verifyApiKey throws an error", () => {
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
          expect(response.status).toBe(401);
          expect(await response.json()).toEqual({ error: "Invalid API key" });
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

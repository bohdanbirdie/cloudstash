import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const mockVerifyApiKey = vi.fn();

vi.mock("../../auth", () => ({
  createAuth: () => ({
    api: { verifyApiKey: mockVerifyApiKey },
  }),
}));

vi.mock("../../db", () => ({
  createDb: () => ({}),
}));

import { ingestRequestToResponse } from "../../ingest/service";

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

async function run(request: Request, env: ReturnType<typeof createEnv>) {
  return Effect.runPromise(ingestRequestToResponse(request, env as never));
}

describe("ingestRequestToResponse", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const request = createRequest({ url: "https://example.com" });
    const env = createEnv();

    const response = await run(request, env);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Missing API key" });
  });

  it("returns 401 when Authorization header has wrong format", async () => {
    const request = createRequest(
      { url: "https://example.com" },
      { Authorization: "Basic abc123" }
    );
    const env = createEnv();

    const response = await run(request, env);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Missing API key" });
  });

  it("returns 401 when API key is invalid", async () => {
    mockVerifyApiKey.mockResolvedValue({ valid: false, key: null });

    const request = createRequest(
      { url: "https://example.com" },
      { Authorization: "Bearer bad-key" }
    );
    const env = createEnv();

    const response = await run(request, env);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid API key" });
  });

  it("returns 401 when API key is missing orgId", async () => {
    mockVerifyApiKey.mockResolvedValue({
      valid: true,
      key: { metadata: {} },
    });

    const request = createRequest(
      { url: "https://example.com" },
      { Authorization: "Bearer valid-key" }
    );
    const env = createEnv();

    const response = await run(request, env);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "API key missing orgId metadata",
    });
  });

  it("returns 400 when request body has no url", async () => {
    mockVerifyApiKey.mockResolvedValue({
      valid: true,
      key: { metadata: { orgId: "org-1" }, userId: "user-1" },
    });

    const request = createRequest({}, { Authorization: "Bearer valid-key" });
    const env = createEnv();

    const response = await run(request, env);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Missing url" });
  });

  it("returns 400 when url is invalid", async () => {
    mockVerifyApiKey.mockResolvedValue({
      valid: true,
      key: { metadata: { orgId: "org-1" }, userId: "user-1" },
    });

    const request = createRequest(
      { url: "not-a-url" },
      { Authorization: "Bearer valid-key" }
    );
    const env = createEnv();

    const response = await run(request, env);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid URL" });
  });

  it("returns 500 when queue send fails", async () => {
    mockVerifyApiKey.mockResolvedValue({
      valid: true,
      key: { metadata: { orgId: "org-1" }, userId: "user-1" },
    });

    const request = createRequest(
      { url: "https://example.com" },
      { Authorization: "Bearer valid-key" }
    );
    const env = createEnv({
      queueSendError: new Error("Queue unavailable"),
    });

    const response = await run(request, env);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Queue send failed: Error: Queue unavailable",
    });
  });

  it("returns 200 and queues link on success", async () => {
    mockVerifyApiKey.mockResolvedValue({
      valid: true,
      key: { metadata: { orgId: "org-1" }, userId: "user-1" },
    });

    const request = createRequest(
      { url: "https://example.com" },
      { Authorization: "Bearer valid-key" }
    );
    const env = createEnv();

    const response = await run(request, env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "queued" });
    expect(env._queueSend).toHaveBeenCalledWith({
      source: "api",
      sourceMeta: null,
      storeId: "org-1",
      url: "https://example.com",
    });
  });
});

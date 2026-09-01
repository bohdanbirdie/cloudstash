import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addWideEvent,
  annotateHonoRoute,
  observeFetch,
  observeOperation,
} from "../../observability/wide-event";
import type { Env } from "../../shared";

const executionContext = {
  waitUntil: vi.fn(),
} as unknown as ExecutionContext;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("wide events", () => {
  it("emits one privacy-safe event for an HTTP request", async () => {
    const output = vi.fn();
    vi.stubGlobal("console", { ...console, info: output });
    const fetch = observeFetch(async () => {
      addWideEvent({
        auth: { method: "session", outcome: "success" },
      });
      return new Response(null, { status: 204 });
    });

    await fetch(
      new Request("https://cloudstash.dev/api/org/private-workspace", {
        headers: { "x-request-id": "user-controlled-value" },
      }),
      {} as Env,
      executionContext
    );

    expect(output).toHaveBeenCalledOnce();
    const event = output.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(event).toMatchObject({
      event: {
        name: "http.request",
        outcome: "success",
        trigger: "http",
      },
      auth: { method: "session", outcome: "success" },
      method: "GET",
      path: "/api/*",
      status: 204,
    });
    expect(event.requestId).not.toBe("user-controlled-value");
    expect(JSON.stringify(event)).not.toContain("private-workspace");
  });

  it("supports direct handler calls without a Cloudflare execution context", async () => {
    const output = vi.fn();
    vi.stubGlobal("console", { ...console, info: output });
    const fetch = observeFetch(async () => new Response(null, { status: 204 }));

    const response = await fetch(
      new Request("https://cloudstash.dev/"),
      {} as Env,
      {} as ExecutionContext
    );

    expect(response.status).toBe(204);
    expect(output).toHaveBeenCalledOnce();
  });

  it("replaces a dynamic Hono path with its registered route", async () => {
    const output = vi.fn();
    vi.stubGlobal("console", { ...console, info: output });
    const app = new Hono();
    app.use("*", annotateHonoRoute);
    app.get("/api/org/:id", (c) => c.body(null, 204));
    const fetch = observeFetch((request, env, ctx) =>
      Promise.resolve(app.fetch(request, env, ctx))
    );

    await fetch(
      new Request("https://cloudstash.dev/api/org/private-workspace"),
      {} as Env,
      executionContext
    );

    expect(output).toHaveBeenCalledOnce();
    expect(output.mock.calls[0]?.[0]).toMatchObject({
      http: { route: "/api/org/:id" },
      path: "/api/org/:id",
    });
    expect(JSON.stringify(output.mock.calls[0]?.[0])).not.toContain(
      "private-workspace"
    );
  });

  it("redacts error details while preserving the error type", async () => {
    const output = vi.fn();
    vi.stubGlobal("console", { ...console, error: output });
    const fetch = observeFetch(async () => {
      throw new TypeError("secret payload from upstream");
    });

    await expect(
      fetch(
        new Request("https://cloudstash.dev/api/ingest"),
        {} as Env,
        executionContext
      )
    ).rejects.toThrow(TypeError);

    expect(output).toHaveBeenCalledOnce();
    const serialized = JSON.stringify(output.mock.calls[0]?.[0]);
    expect(serialized).toContain("TypeError");
    expect(serialized).not.toContain("secret payload from upstream");
  });

  it("emits one event for a non-HTTP operation", async () => {
    const output = vi.fn();
    vi.stubGlobal("console", { ...console, info: output });

    await observeOperation(
      {
        event: { name: "queue.batch", trigger: "queue" },
        queue: { name: "test-queue", batchSize: 2 },
      },
      async () => {
        addWideEvent({ work: { attempted: 2, succeeded: 2 } });
      }
    );

    expect(output).toHaveBeenCalledOnce();
    expect(output.mock.calls[0]?.[0]).toMatchObject({
      event: {
        name: "queue.batch",
        outcome: "success",
        trigger: "queue",
      },
      queue: { name: "test-queue", batchSize: 2 },
      work: { attempted: 2, succeeded: 2 },
    });
  });
});

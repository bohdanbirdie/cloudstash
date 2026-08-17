import { describe, expect, it, vi } from "vitest";

import { handleOAuthMetadataRequest } from "../../auth/oauth-metadata";

const env = {
  BETTER_AUTH_URL: "https://cloudstash.test",
} as Cloudflare.Env;

describe("OAuth discovery routing", () => {
  for (const method of ["GET", "HEAD"] as const) {
    it(`passes the root well-known ${method} URL to Better Auth unchanged`, async () => {
      const handler = vi.fn(async (request: Request) =>
        Response.json({ url: request.url })
      );
      const request = new Request(
        "https://cloudstash.test/.well-known/oauth-authorization-server",
        { method }
      );

      const response = await handleOAuthMetadataRequest(request, env, handler);

      expect(handler).toHaveBeenCalledWith(request);
      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://cloudstash.test"
      );
    });
  }

  it("answers discovery preflight without invoking Better Auth", async () => {
    const handler = vi.fn(async () => new Response(null, { status: 500 }));
    const response = await handleOAuthMetadataRequest(
      new Request(
        "https://cloudstash.test/.well-known/oauth-protected-resource/mcp",
        { method: "OPTIONS" }
      ),
      env,
      handler
    );

    expect(handler).not.toHaveBeenCalled();
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "OPTIONS"
    );
  });
});

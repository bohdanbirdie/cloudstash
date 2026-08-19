import { describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { expect, vi } from "vitest";

import { handleOAuthMetadataRequest } from "../../auth/oauth-metadata";

const env = {
  BETTER_AUTH_URL: "https://cloudstash.test",
} as Cloudflare.Env;

describe("OAuth discovery routing", () => {
  for (const method of ["GET", "HEAD"] as const) {
    it.effect(
      `passes the root well-known ${method} URL to Better Auth unchanged`,
      () =>
        Effect.gen(function* () {
          const handler = vi.fn(async (request: Request) =>
            Response.json({ url: request.url })
          );
          const request = new Request(
            "https://cloudstash.test/.well-known/oauth-authorization-server",
            { method }
          );

          const response = yield* handleOAuthMetadataRequest(
            request,
            env,
            handler
          );

          expect(handler).toHaveBeenCalledWith(request);
          expect(response.status).toBe(200);
          expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
            "https://cloudstash.test"
          );
        })
    );
  }

  it.effect("answers discovery preflight without invoking Better Auth", () =>
    Effect.gen(function* () {
      const handler = vi.fn(async () => new Response(null, { status: 500 }));
      const response = yield* handleOAuthMetadataRequest(
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
    })
  );
});

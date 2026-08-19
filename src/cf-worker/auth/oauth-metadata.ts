import { Effect } from "effect";

import type { Env } from "../shared";

export const withOAuthMetadataCors = (
  response: Response,
  env: Env
): Response => {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Headers", "Accept, Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  headers.set(
    "Access-Control-Allow-Origin",
    new URL(env.BETTER_AUTH_URL).origin
  );
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
};

export const oauthMetadataPreflight = (env: Env): Response =>
  withOAuthMetadataCors(new Response(null, { status: 204 }), env);

export const handleOAuthMetadataRequest = Effect.fn("Auth.oauthMetadata")(
  function* (
    request: Request,
    env: Env,
    authHandler: (request: Request) => Promise<Response>
  ) {
    if (request.method === "OPTIONS") {
      return oauthMetadataPreflight(env);
    }

    // Better Auth inspects the absolute well-known path before its base path.
    const response = yield* Effect.promise(() => authHandler(request));
    return withOAuthMetadataCors(response, env);
  }
);

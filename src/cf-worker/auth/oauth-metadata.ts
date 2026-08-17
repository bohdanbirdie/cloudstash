import type { Env } from "../shared";

const withMetadataCors = (response: Response, env: Env): Response => {
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

export const handleOAuthMetadataRequest = async (
  request: Request,
  env: Env,
  authHandler: (request: Request) => Promise<Response>
): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return withMetadataCors(new Response(null, { status: 204 }), env);
  }

  // Better Auth's OAuth/MCP onRequest hooks inspect these absolute root paths
  // before its /api/auth router basePath is applied. Preserve the URL verbatim.
  return withMetadataCors(await authHandler(request), env);
};

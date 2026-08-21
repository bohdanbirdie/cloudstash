import { Clock, Effect } from "effect";

import type { Database } from "../db";
import * as schema from "../db/schema";
import { query } from "../db/service";
import { safeErrorInfo } from "../log-utils";
import { mcpResource } from "../mcp/config";
import type { Env } from "../shared";

const PROTECTED_RESOURCE_METADATA_PATH =
  "/.well-known/oauth-protected-resource";

// D1's conflict-safe insert closes Better Auth's read/create race once per
// isolate; the cache avoids turning normal auth construction into a DB write.
const initializedDatabases = new WeakSet<D1Database>();

const isMcpProtectedResourceMetadata = (
  request: Request,
  env: Env
): boolean => {
  if (request.method !== "GET") return false;
  const requestPath = new URL(request.url).pathname.replace(/\/+$/, "");
  const resourcePath = new URL(mcpResource(env)).pathname.replace(/\/+$/, "");
  return (
    requestPath === PROTECTED_RESOURCE_METADATA_PATH ||
    requestPath === `${PROTECTED_RESOURCE_METADATA_PATH}${resourcePath}`
  );
};

/**
 * Better Auth correctly keeps `offline_access` out of protected-resource
 * metadata. Some MCP clients nevertheless treat a present `scopes_supported`
 * there as the complete authorization request and never consult the
 * authorization-server scopes. Omitting this optional field makes those
 * clients use the AS metadata, where `offline_access` belongs, so they receive
 * a rotating refresh token instead of requiring login every five minutes.
 */
export const prepareMcpProtectedResourceMetadata = async (
  request: Request,
  response: Response,
  env: Env
): Promise<Response> => {
  if (
    !isMcpProtectedResourceMetadata(request, env) ||
    !response.ok ||
    !response.headers.get("content-type")?.includes("application/json")
  ) {
    return response;
  }

  const metadata = (await response.clone().json()) as unknown;
  if (
    typeof metadata !== "object" ||
    metadata === null ||
    !("scopes_supported" in metadata)
  ) {
    return response;
  }

  const { scopes_supported: _scopesSupported, ...resourceMetadata } = metadata;
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("ETag");
  return Response.json(resourceMetadata, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
};

export const ensureMcpOAuthResource = Effect.fnUntraced(function* (
  db: Database,
  env: Env
) {
  if (initializedDatabases.has(env.DB)) return;
  const now = new Date(yield* Clock.currentTimeMillis);
  const identifier = mcpResource(env);
  yield* query(
    db
      .insert(schema.oauthResource)
      .values({
        id: crypto.randomUUID(),
        identifier,
        name: identifier,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: schema.oauthResource.identifier })
  );
  initializedDatabases.add(env.DB);
});

export const authBackendUnavailable = (cause: unknown) =>
  Effect.logError("Authentication database unavailable").pipe(
    Effect.annotateLogs(safeErrorInfo(cause)),
    Effect.as(
      Response.json(
        { error: "Authentication backend unavailable" },
        { status: 503 }
      )
    )
  );

import { Clock, Effect } from "effect";

import type { Database } from "../db";
import * as schema from "../db/schema";
import { query } from "../db/service";
import { safeErrorInfo } from "../log-utils";
import { mcpResource } from "../mcp/config";
import type { Env } from "../shared";

// D1's conflict-safe insert closes Better Auth's read/create race once per
// isolate; the cache avoids turning normal auth construction into a DB write.
const initializedDatabases = new WeakSet<D1Database>();

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

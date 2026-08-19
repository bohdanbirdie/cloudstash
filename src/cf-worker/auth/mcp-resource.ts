import { Clock, Effect } from "effect";

import type { Database } from "../db";
import * as schema from "../db/schema";
import { DbClient, query } from "../db/service";
import { safeErrorInfo } from "../log-utils";
import { mcpResource } from "../mcp/config";
import type { Env } from "../shared";

// D1's conflict-safe insert closes Better Auth's read/create race once per
// isolate; the cache avoids turning normal auth construction into a DB write.
const initializedDatabases = new WeakSet<D1Database>();

export const ensureMcpResource = Effect.fnUntraced(function* (
  db: Database,
  d1: D1Database,
  identifier: string
) {
  if (initializedDatabases.has(d1)) return;
  const now = new Date(yield* Clock.currentTimeMillis);
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
  initializedDatabases.add(d1);
});

export const initializeMcpOAuthResource = Effect.fn(
  "Auth.initializeMcpOAuthResource"
)(function* (env: Env) {
  const db = yield* DbClient;
  yield* ensureMcpResource(db, env.DB, mcpResource(env));
});

export const mcpResourceUnavailable = (cause: unknown) =>
  Effect.logError("OAuth resource initialization failed").pipe(
    Effect.annotateLogs(safeErrorInfo(cause)),
    Effect.as(
      Response.json(
        { error: "Authentication backend unavailable" },
        { status: 503 }
      )
    )
  );

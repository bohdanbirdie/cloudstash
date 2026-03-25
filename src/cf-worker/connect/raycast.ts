import { and, eq, gt } from "drizzle-orm";

import { createAuth } from "../auth";
import { createDb } from "../db";
import * as schema from "../db/schema";
import { logSync } from "../logger";
import type { Env } from "../shared";

const logger = logSync("RaycastConnect");

export async function handleRaycastConnect(
  request: Request,
  env: Env
): Promise<Response> {
  const db = createDb(env.DB);
  const auth = createAuth(env, db);

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = session.session.activeOrganizationId;
  if (!orgId) {
    return Response.json({ error: "No active organization" }, { status: 400 });
  }

  const userId = session.user.id;

  // Revoke any existing Raycast API keys for this user
  const existingKeys = await db
    .select({ id: schema.apikey.id, metadata: schema.apikey.metadata })
    .from(schema.apikey)
    .where(eq(schema.apikey.referenceId, userId));

  for (const key of existingKeys) {
    try {
      const metadata = key.metadata ? JSON.parse(key.metadata) : null;
      if (metadata?.source === "raycast") {
        await db.delete(schema.apikey).where(eq(schema.apikey.id, key.id));
        logger.info("Revoked existing Raycast API key", { userId });
      }
    } catch {
      // Skip keys with invalid metadata
    }
  }

  // Create new API key with Raycast source metadata
  const result = await auth.api.createApiKey({
    body: {
      metadata: { orgId, source: "raycast" },
      name: "Raycast Extension",
    },
    headers: request.headers,
  });

  if (!result?.key) {
    return Response.json(
      { error: "Failed to create API key" },
      { status: 500 }
    );
  }

  // Store one-time code in verification table (60s TTL)
  const code = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60_000);

  await db.insert(schema.verification).values({
    id: crypto.randomUUID(),
    identifier: `raycast-connect:${code}`,
    value: result.key,
    createdAt: now,
    expiresAt,
    updatedAt: now,
  });

  logger.info("Raycast connect code created", { userId });

  return Response.json({ code });
}

export async function handleRaycastExchange(
  request: Request,
  env: Env
): Promise<Response> {
  const body = (await request.json()) as { code?: string };
  if (!body.code) {
    return Response.json({ error: "Missing code" }, { status: 400 });
  }

  const db = createDb(env.DB);
  const identifier = `raycast-connect:${body.code}`;

  const record = await db
    .select()
    .from(schema.verification)
    .where(
      and(
        eq(schema.verification.identifier, identifier),
        gt(schema.verification.expiresAt, new Date())
      )
    )
    .get();

  if (!record) {
    return Response.json({ error: "Invalid or expired code" }, { status: 400 });
  }

  // Delete the one-time code
  await db
    .delete(schema.verification)
    .where(eq(schema.verification.id, record.id));

  logger.info("Raycast connect code exchanged");

  return Response.json({ apiKey: record.value });
}

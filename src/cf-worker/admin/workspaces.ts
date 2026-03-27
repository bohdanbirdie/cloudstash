import { eq } from "drizzle-orm";
import { Effect } from "effect";

import * as schema from "../db/schema";
import type { OrgFeatures } from "../db/schema";
import { DbClient, DbClientLive } from "../db/service";
import { maskId } from "../log-utils";
import { logSync } from "../logger";
import type { Env } from "../shared";

const logger = logSync("Admin");

export interface WorkspaceWithOwner {
  id: string;
  name: string;
  slug: string | null;
  creatorEmail: string | null;
  features: OrgFeatures;
}

export async function handleListWorkspaces(
  _request: Request,
  env: Env
): Promise<Response> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const db = yield* DbClient;
      const orgs = yield* Effect.promise(() =>
        db.query.organization.findMany({
          with: {
            members: {
              where: eq(schema.member.role, "owner"),
              with: {
                user: { columns: { email: true } },
              },
              limit: 1,
            },
          },
        })
      );

      const workspaces: WorkspaceWithOwner[] = orgs.map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        creatorEmail: org.members[0]?.user?.email ?? null,
        features: (org.features as OrgFeatures) ?? {},
      }));

      logger.info("List workspaces", { count: workspaces.length });
      return Response.json({ workspaces });
    }).pipe(Effect.provide(DbClientLive(env.DB)))
  );
}

export async function handleGetOrgSettings(
  _request: Request,
  orgId: string,
  env: Env
): Promise<Response> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const db = yield* DbClient;
      const org = yield* Effect.promise(() =>
        db.query.organization.findFirst({
          where: eq(schema.organization.id, orgId),
          columns: { features: true },
        })
      );

      if (!org) {
        logger.info("Get org settings not found", { orgId: maskId(orgId) });
        return Response.json(
          { error: "Organization not found" },
          { status: 404 }
        );
      }

      logger.debug("Get org settings", { orgId: maskId(orgId) });
      return Response.json({ features: (org.features as OrgFeatures) ?? {} });
    }).pipe(Effect.provide(DbClientLive(env.DB)))
  );
}

export async function handleUpdateOrgSettings(
  request: Request,
  orgId: string,
  env: Env
): Promise<Response> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const db = yield* DbClient;

      let body: { features: OrgFeatures };
      try {
        body = (yield* Effect.promise(() => request.json())) as {
          features: OrgFeatures;
        };
      } catch {
        logger.warn("Update org settings invalid body", {
          orgId: maskId(orgId),
        });
        return Response.json(
          { error: "Invalid request body" },
          { status: 400 }
        );
      }

      const org = yield* Effect.promise(() =>
        db.query.organization.findFirst({
          where: eq(schema.organization.id, orgId),
          columns: { id: true },
        })
      );

      if (!org) {
        logger.info("Update org settings not found", { orgId: maskId(orgId) });
        return Response.json(
          { error: "Organization not found" },
          { status: 404 }
        );
      }

      yield* Effect.promise(() =>
        db
          .update(schema.organization)
          .set({ features: body.features })
          .where(eq(schema.organization.id, orgId))
      );

      logger.info("Update org settings", {
        orgId: maskId(orgId),
        features: Object.keys(body.features),
      });
      return Response.json({ success: true, features: body.features });
    }).pipe(Effect.provide(DbClientLive(env.DB)))
  );
}

import { eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import * as schema from "../db/schema";
import type { OrgFeatures as OrgFeaturesType } from "../db/schema";
import { DbClient, DbError, query } from "../db/service";

export interface WorkspaceWithOwner {
  id: string;
  name: string;
  slug: string | null;
  creatorEmail: string | null;
  features: OrgFeaturesType;
}

export class OrgFeatures extends Context.Tag("@cloudstash/OrgFeatures")<
  OrgFeatures,
  {
    readonly get: (orgId: string) => Effect.Effect<OrgFeaturesType, DbError>;
    readonly exists: (orgId: string) => Effect.Effect<boolean, DbError>;
    readonly update: (
      orgId: string,
      features: OrgFeaturesType
    ) => Effect.Effect<void, DbError>;
    readonly listWithOwners: () => Effect.Effect<WorkspaceWithOwner[], DbError>;
  }
>() {}

export const OrgFeaturesLive = Layer.effect(
  OrgFeatures,
  Effect.gen(function* () {
    const db = yield* DbClient;
    return OrgFeatures.of({
      get: (orgId) =>
        query(
          db.query.organization.findFirst({
            where: eq(schema.organization.id, orgId),
            columns: { features: true },
          })
        ).pipe(Effect.map((org) => (org?.features as OrgFeaturesType) ?? {})),

      exists: (orgId) =>
        query(
          db.query.organization.findFirst({
            where: eq(schema.organization.id, orgId),
            columns: { id: true },
          })
        ).pipe(Effect.map((org) => !!org)),

      update: (orgId, features) =>
        query(
          db
            .update(schema.organization)
            .set({ features })
            .where(eq(schema.organization.id, orgId))
        ).pipe(Effect.asVoid),

      listWithOwners: () =>
        query(
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
        ).pipe(
          Effect.map((orgs) =>
            orgs.map((org) => ({
              id: org.id,
              name: org.name,
              slug: org.slug,
              creatorEmail: org.members[0]?.user?.email ?? null,
              features: (org.features as OrgFeaturesType) ?? {},
            }))
          )
        ),
    });
  })
);

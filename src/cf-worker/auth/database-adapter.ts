import type { DBAdapter } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";

import type { Database } from "../db";
import * as schema from "../db/schema";

/**
 * Better Auth seeds configured OAuth resources with a read-then-create flow.
 * Separate Worker isolates can both observe a missing row and race on the
 * unique identifier. Make the one application-owned resource idempotent at
 * the database boundary; all other adapter operations retain their standard
 * Better Auth semantics.
 */
export function cloudstashAuthAdapter(
  db: Database,
  oauthResourceIdentifier: string
) {
  const factory = drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  });

  return (options: Parameters<typeof factory>[0]) => {
    const adapter = factory(options);

    const create: DBAdapter["create"] = async <
      T extends Record<string, any>,
      R = T,
    >(request: {
      model: string;
      data: Omit<T, "id">;
      select?: string[];
      forceAllowId?: boolean;
    }): Promise<R> => {
      if (
        request.model !== "oauthResource" ||
        request.data.identifier !== oauthResourceIdentifier
      ) {
        return adapter.create<T, R>(request);
      }

      const data = request.data as unknown as Omit<
        typeof schema.oauthResource.$inferInsert,
        "id"
      >;
      const [inserted] = await db
        .insert(schema.oauthResource)
        .values({ ...data, id: crypto.randomUUID() })
        .onConflictDoNothing({ target: schema.oauthResource.identifier })
        .returning();

      const resource =
        inserted ??
        (await db.query.oauthResource.findFirst({
          where: eq(schema.oauthResource.identifier, oauthResourceIdentifier),
        }));

      if (!resource) {
        throw new Error("OAuth resource seed did not produce a database row");
      }

      return resource as R;
    };

    return { ...adapter, create };
  };
}

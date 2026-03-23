import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";

import { createDb } from "../../db";
import { organization } from "../../db/schema";
import type { OrgFeatures } from "../../db/schema";
import { FeatureStore } from "../services";

export const FeatureStoreLive = (d1: D1Database) =>
  Layer.succeed(FeatureStore, {
    getFeatures: (storeId) =>
      Effect.promise(async () => {
        const db = createDb(d1);
        const org = await db.query.organization.findFirst({
          where: eq(organization.id, storeId),
          columns: { features: true },
        });
        return (org?.features ?? {}) as OrgFeatures;
      }),
  });

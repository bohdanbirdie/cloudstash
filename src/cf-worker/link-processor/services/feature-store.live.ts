import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";

import { organization } from "../../db/schema";
import type { OrgFeatures } from "../../db/schema";
import { DbClient } from "../../db/service";
import { FeatureStore } from "../services";

export const FeatureStoreLive = Layer.effect(
  FeatureStore,
  Effect.gen(function* () {
    const db = yield* DbClient;
    return {
      getFeatures: (storeId: string) =>
        Effect.promise(async () => {
          const org = await db.query.organization.findFirst({
            where: eq(organization.id, storeId),
            columns: { features: true },
          });
          return (org?.features ?? {}) as OrgFeatures;
        }),
    };
  })
);

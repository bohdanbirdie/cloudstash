import { Effect, Layer } from "effect";

import { OrgFeatures } from "../../org/features-service";
import { FeatureStore } from "../services";

export const FeatureStoreLive = Layer.effect(
  FeatureStore,
  Effect.gen(function* () {
    const orgFeatures = yield* OrgFeatures;
    return {
      getFeatures: (storeId: string) =>
        orgFeatures
          .get(storeId)
          .pipe(Effect.catchTag("DbError", () => Effect.succeed({}))),
    };
  })
);

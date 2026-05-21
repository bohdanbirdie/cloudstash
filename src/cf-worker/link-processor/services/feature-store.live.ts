import { Effect, Layer } from "effect";

import { capabilitiesFor } from "@/lib/plan";

import { Billing } from "../../billing/service";
import type { OrgId } from "../../db/branded";
import { maskId } from "../../log-utils";
import { FeatureStore } from "../services";

export const FeatureStoreLive = Layer.effect(
  FeatureStore,
  Effect.gen(function* () {
    const billing = yield* Billing;
    return {
      getCapabilities: Effect.fn("FeatureStore.getCapabilities")(function* (
        storeId: OrgId
      ) {
        yield* Effect.annotateCurrentSpan({ orgId: maskId(storeId) });
        return yield* billing.capabilities(storeId).pipe(
          Effect.catchTags({
            DbError: (cause) =>
              Effect.logWarning(
                "FeatureStore: DbError, falling back to free tier"
              ).pipe(
                Effect.annotateLogs({
                  cause: String(cause),
                  orgId: maskId(storeId),
                }),
                Effect.as(capabilitiesFor("free"))
              ),
            OrgNotFoundError: () =>
              Effect.logWarning(
                "FeatureStore: org missing, falling back to free tier"
              ).pipe(
                Effect.annotateLogs({ orgId: maskId(storeId) }),
                Effect.as(capabilitiesFor("free"))
              ),
          })
        );
      }),
    };
  })
);

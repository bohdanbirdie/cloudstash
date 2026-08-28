import { Context, Data, Effect, Layer } from "effect";

import { OrgId } from "../db/branded";
import { maskId } from "../log-utils";
import { ENRICHMENT_USAGE_KEY, getCurrentPeriod } from "./types";

export class EnrichmentUsageTransactionError extends Data.TaggedError(
  "EnrichmentUsageTransactionError"
)<{
  readonly storeId: OrgId;
  readonly period: string;
  readonly cause: unknown;
}> {}

export interface EnrichmentUsageBindings {
  readonly storage: DurableObjectStorage;
}

export interface EnrichmentReservation {
  readonly period: string;
  readonly reserved: boolean;
  readonly used: number;
}

export class EnrichmentUsage extends Context.Service<
  EnrichmentUsage,
  {
    readonly reserve: (
      storeId: OrgId,
      cap: number
    ) => Effect.Effect<EnrichmentReservation, EnrichmentUsageTransactionError>;
  }
>()("@cloudstash/EnrichmentUsage") {}

export const EnrichmentUsageLive = (bindings: EnrichmentUsageBindings) =>
  Layer.succeed(EnrichmentUsage, {
    reserve: Effect.fn("EnrichmentUsage.reserve")(function* (
      storeId: OrgId,
      cap: number
    ) {
      const period = getCurrentPeriod();
      yield* Effect.annotateCurrentSpan({
        storeId: maskId(storeId),
        period,
      });
      const key = ENRICHMENT_USAGE_KEY(storeId, period);
      const reservation = yield* Effect.tryPromise({
        try: () =>
          bindings.storage.transaction(async (transaction) => {
            const used = (await transaction.get<number>(key)) ?? 0;
            if (used >= cap) {
              return { period, reserved: false, used } as const;
            }
            const next = used + 1;
            await transaction.put(key, next);
            return { period, reserved: true, used: next } as const;
          }),
        catch: (cause) =>
          new EnrichmentUsageTransactionError({ storeId, period, cause }),
      });
      yield* Effect.annotateCurrentSpan({
        reserved: reservation.reserved,
        used: reservation.used,
      });
      return reservation;
    }),
  });

import { Context, Data, DateTime, Effect, Layer, Schema } from "effect";

import { UsageMeter } from "../billing/usage-meter";
import { OrgId } from "../db/branded";
import { maskId } from "../log-utils";

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

export interface EnrichmentUsageShape {
  readonly reserve: (
    storeId: OrgId,
    input: {
      readonly cap: number;
      readonly settlementId: string;
      readonly windowId: string;
    }
  ) => Effect.Effect<EnrichmentReservation, EnrichmentUsageTransactionError>;
}

const LegacyUsageCount = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export class EnrichmentUsage extends Context.Service<
  EnrichmentUsage,
  EnrichmentUsageShape
>()("@cloudstash/EnrichmentUsage") {
  static layer(bindings: EnrichmentUsageBindings) {
    return makeEnrichmentUsageLayer(bindings);
  }
}

const makeEnrichmentUsageLayer = (bindings: EnrichmentUsageBindings) =>
  Layer.effect(
    EnrichmentUsage,
    Effect.gen(function* () {
      const meter = yield* UsageMeter;
      return EnrichmentUsage.of({
        reserve: Effect.fn("EnrichmentUsage.reserve")(function* (
          storeId: OrgId,
          input: {
            readonly cap: number;
            readonly settlementId: string;
            readonly windowId: string;
          }
        ) {
          const period = input.windowId;
          const now = yield* DateTime.nowAsDate;
          const legacyPeriod = now.toISOString().slice(0, 7);
          const legacyStored = yield* Effect.tryPromise({
            try: () =>
              bindings.storage.get(`enrichment:${storeId}:${legacyPeriod}`),
            catch: (cause) =>
              new EnrichmentUsageTransactionError({
                storeId,
                period,
                cause,
              }),
          });
          let initialCount = 0;
          if (legacyStored !== undefined) {
            initialCount = yield* Schema.decodeUnknownEffect(LegacyUsageCount)(
              legacyStored
            ).pipe(
              Effect.mapError(
                (cause) =>
                  new EnrichmentUsageTransactionError({
                    storeId,
                    period,
                    cause,
                  })
              )
            );
          }
          yield* Effect.annotateCurrentSpan({
            storeId: maskId(storeId),
            period,
          });
          const reservation = yield* meter
            .reserve({
              initialCount,
              limit: input.cap,
              metric: "xEnrichments",
              settlementId: input.settlementId,
              windowId: input.windowId,
            })
            .pipe(
              Effect.mapError(
                (cause) =>
                  new EnrichmentUsageTransactionError({
                    storeId,
                    period,
                    cause,
                  })
              )
            );
          const reserved =
            reservation.status === "reserved" ||
            reservation.status === "duplicate";
          yield* Effect.annotateCurrentSpan({
            reserved,
            used: reservation.count,
          });
          return { period, reserved, used: reservation.count };
        }),
      });
    })
  ).pipe(Layer.provide(UsageMeter.layer(bindings.storage)));

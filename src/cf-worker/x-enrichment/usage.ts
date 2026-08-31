import { Context, Data, Effect, Layer } from "effect";

import { UsageMeter, UsageMeterLive } from "../billing/usage-meter";
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

export class EnrichmentUsage extends Context.Service<
  EnrichmentUsage,
  {
    readonly reserve: (
      storeId: OrgId,
      input: {
        readonly cap: number;
        readonly settlementId: string;
        readonly windowId: string;
      }
    ) => Effect.Effect<EnrichmentReservation, EnrichmentUsageTransactionError>;
  }
>()("@cloudstash/EnrichmentUsage") {}

export const EnrichmentUsageLive = (bindings: EnrichmentUsageBindings) =>
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
          yield* Effect.annotateCurrentSpan({
            storeId: maskId(storeId),
            period,
          });
          const reservation = yield* meter
            .reserve({
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
  ).pipe(Layer.provide(UsageMeterLive(bindings.storage)));

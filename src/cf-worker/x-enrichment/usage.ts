import { Context, Duration, Effect, Layer, Option, Schema } from "effect";

import { OrgId } from "../db/branded";
import { maskId } from "../log-utils";
import { ENRICHMENT_USAGE_KEY, getCurrentPeriod } from "./types";

const COUNTER_TTL = Duration.days(70);

export class EnrichmentUsageGetError extends Schema.TaggedError<EnrichmentUsageGetError>()(
  "EnrichmentUsageGetError",
  {
    storeId: OrgId,
    period: Schema.String,
    cause: Schema.Defect,
  }
) {}

export class EnrichmentUsagePutError extends Schema.TaggedError<EnrichmentUsagePutError>()(
  "EnrichmentUsagePutError",
  {
    storeId: OrgId,
    period: Schema.String,
    cause: Schema.Defect,
  }
) {}

export type AnyEnrichmentUsageError =
  | EnrichmentUsageGetError
  | EnrichmentUsagePutError;

export interface EnrichmentUsageBindings {
  readonly kv: KVNamespace;
}

export class EnrichmentUsage extends Context.Tag("@cloudstash/EnrichmentUsage")<
  EnrichmentUsage,
  {
    readonly current: (
      storeId: OrgId
    ) => Effect.Effect<
      { used: number; period: string },
      EnrichmentUsageGetError
    >;
    readonly increment: (
      storeId: OrgId
    ) => Effect.Effect<
      { used: number; period: string },
      AnyEnrichmentUsageError
    >;
  }
>() {}

const parseUsed = (raw: string | null): number =>
  Option.fromNullable(raw).pipe(
    Option.map((s) => Number.parseInt(s, 10)),
    Option.filter((n) => Number.isFinite(n)),
    Option.getOrElse(() => 0)
  );

export const EnrichmentUsageLive = (bindings: EnrichmentUsageBindings) =>
  Layer.succeed(EnrichmentUsage, {
    current: Effect.fn("EnrichmentUsage.current")(function* (storeId: OrgId) {
      const period = getCurrentPeriod();
      yield* Effect.annotateCurrentSpan({
        storeId: maskId(storeId),
        period,
      });
      const key = ENRICHMENT_USAGE_KEY(storeId, period);
      const raw = yield* Effect.tryPromise({
        try: () => bindings.kv.get(key),
        catch: (cause) =>
          new EnrichmentUsageGetError({ storeId, period, cause }),
      });
      const used = parseUsed(raw);
      yield* Effect.annotateCurrentSpan("used", used);
      return { used, period };
    }),
    increment: Effect.fn("EnrichmentUsage.increment")(function* (
      storeId: OrgId
    ) {
      const period = getCurrentPeriod();
      yield* Effect.annotateCurrentSpan({
        storeId: maskId(storeId),
        period,
      });
      const key = ENRICHMENT_USAGE_KEY(storeId, period);
      const raw = yield* Effect.tryPromise({
        try: () => bindings.kv.get(key),
        catch: (cause) =>
          new EnrichmentUsageGetError({ storeId, period, cause }),
      });
      const next = parseUsed(raw) + 1;
      yield* Effect.tryPromise({
        try: () =>
          bindings.kv.put(key, String(next), {
            expirationTtl: Duration.toSeconds(COUNTER_TTL),
          }),
        catch: (cause) =>
          new EnrichmentUsagePutError({ storeId, period, cause }),
      });
      yield* Effect.annotateCurrentSpan("used", next);
      return { used: next, period };
    }),
  });

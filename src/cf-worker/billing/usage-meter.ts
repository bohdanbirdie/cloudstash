import { Context, Effect, Layer, Schema } from "effect";

export const UsageMetric = Schema.Literals([
  "aiSummaries",
  "externalCalls",
  "xEnrichments",
]);
export type UsageMetric = typeof UsageMetric.Type;

export const CountedUsage = Schema.Struct({
  count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  settlements: Schema.Array(Schema.String),
});
export type CountedUsage = typeof CountedUsage.Type;

export const UsageReservation = Schema.Struct({
  count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  status: Schema.Literals([
    "reserved",
    "duplicate",
    "limit_reached",
    "unavailable",
  ]),
});
export type UsageReservation = typeof UsageReservation.Type;

export class UsageMeterStorageError extends Schema.TaggedErrorClass<UsageMeterStorageError>()(
  "UsageMeterStorageError",
  {
    metric: UsageMetric,
    operation: Schema.String,
    windowId: Schema.String,
    cause: Schema.Defect(),
  }
) {
  override get message(): string {
    return `Usage meter ${this.operation} failed for ${this.metric}`;
  }
}

const usageKey = (metric: UsageMetric, windowId: string) =>
  `counted-usage:${metric}:${windowId}`;

const emptyUsage = (): CountedUsage =>
  CountedUsage.make({ count: 0, settlements: [] });

const decodeStored = (
  value: unknown,
  metric: UsageMetric,
  windowId: string
): Promise<CountedUsage> =>
  Schema.decodeUnknownPromise(CountedUsage)(value).catch((cause) =>
    Promise.reject(
      new UsageMeterStorageError({
        metric,
        operation: "decode",
        windowId,
        cause,
      })
    )
  );

export interface UsageMeterShape {
  readonly reserve: (input: {
    readonly initialCount?: number;
    readonly limit: number;
    readonly metric: UsageMetric;
    readonly settlementId?: string;
    readonly windowId: string;
  }) => Effect.Effect<UsageReservation, UsageMeterStorageError>;
  readonly get: (
    metric: UsageMetric,
    windowId: string
  ) => Effect.Effect<CountedUsage, UsageMeterStorageError>;
}

export class UsageMeter extends Context.Service<UsageMeter, UsageMeterShape>()(
  "@cloudstash/UsageMeter"
) {
  static layer(storage: DurableObjectStorage): Layer.Layer<UsageMeter> {
    return makeUsageMeterLayer(storage);
  }
}

const makeUsageMeterLayer = (
  storage: DurableObjectStorage
): Layer.Layer<UsageMeter> => {
  const get = Effect.fn("UsageMeter.get")(function* (
    metric: UsageMetric,
    windowId: string
  ) {
    const stored = yield* Effect.tryPromise({
      try: () => storage.get(usageKey(metric, windowId)),
      catch: (cause) =>
        new UsageMeterStorageError({
          metric,
          operation: "read",
          windowId,
          cause,
        }),
    });
    if (stored === undefined) return emptyUsage();
    return yield* Effect.tryPromise({
      try: () => decodeStored(stored, metric, windowId),
      catch: (cause) => {
        if (cause instanceof UsageMeterStorageError) return cause;
        return new UsageMeterStorageError({
          metric,
          operation: "decode",
          windowId,
          cause,
        });
      },
    });
  });

  const reserve = Effect.fn("UsageMeter.reserve")(function* (input: {
    readonly initialCount?: number;
    readonly limit: number;
    readonly metric: UsageMetric;
    readonly settlementId?: string;
    readonly windowId: string;
  }) {
    const { initialCount = 0, limit, metric, settlementId, windowId } = input;
    if (
      !Number.isSafeInteger(limit) ||
      limit < 0 ||
      !Number.isSafeInteger(initialCount) ||
      initialCount < 0
    ) {
      return yield* new UsageMeterStorageError({
        metric,
        operation: "validate-limit",
        windowId,
        cause: new Error(
          "Usage limit and initial count must be non-negative safe integers"
        ),
      });
    }

    const reservation = yield* Effect.tryPromise({
      try: () =>
        storage.transaction(async (transaction) => {
          const key = usageKey(metric, windowId);
          const stored = await transaction.get(key);
          let current = CountedUsage.make({
            count: initialCount,
            settlements: [],
          });
          if (stored !== undefined) {
            current = await decodeStored(stored, metric, windowId);
          }

          if (
            settlementId !== undefined &&
            current.settlements.includes(settlementId)
          ) {
            return UsageReservation.make({
              count: current.count,
              status: "duplicate",
            });
          }
          if (current.count >= limit) {
            return UsageReservation.make({
              count: current.count,
              status: "limit_reached",
            });
          }

          const settlements = [...current.settlements];
          if (settlementId !== undefined) settlements.push(settlementId);
          const next = CountedUsage.make({
            count: current.count + 1,
            settlements,
          });
          await transaction.put(key, next);
          return UsageReservation.make({
            count: next.count,
            status: "reserved",
          });
        }),
      catch: (cause) => {
        if (cause instanceof UsageMeterStorageError) return cause;
        return new UsageMeterStorageError({
          metric,
          operation: "reserve",
          windowId,
          cause,
        });
      },
    });
    yield* Effect.annotateCurrentSpan({
      "usage.count": reservation.count,
      "usage.limit": limit,
      "usage.metric": metric,
      "usage.status": reservation.status,
    });
    return reservation;
  });

  return Layer.succeed(UsageMeter, UsageMeter.of({ get, reserve }));
};

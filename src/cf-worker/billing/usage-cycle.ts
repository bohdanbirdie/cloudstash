import { DateTime, Match, Schema } from "effect";

export const MonthlyUsageWindow = Schema.Struct({
  id: Schema.String,
  startsAt: Schema.String,
  resetsAt: Schema.String,
});
export type MonthlyUsageWindow = Schema.Schema.Type<typeof MonthlyUsageWindow>;

/** @deprecated Use the workload-neutral monthly usage-window name. */
export const AssistantUsageWindow = MonthlyUsageWindow;
export type AssistantUsageWindow = Schema.Schema.Type<
  typeof AssistantUsageWindow
>;

export const UsageCycleState = Schema.Struct({
  source: Schema.Literals(["stripe", "admin"]),
  billingInterval: Schema.NullOr(Schema.Literals(["month", "year"])),
  currentPeriodStart: Schema.NullOr(Schema.DateValid),
  currentPeriodEnd: Schema.NullOr(Schema.DateValid),
  usageCycleAnchor: Schema.NullOr(Schema.DateValid),
});
export type UsageCycleState = Schema.Schema.Type<typeof UsageCycleState>;

const isValidDate = (value: Date | null): value is Date =>
  value !== null && !Number.isNaN(value.getTime());

const monthlyOccurrence = (anchor: Date, monthOffset: number): Date =>
  DateTime.makeUnsafe(anchor).pipe(
    DateTime.add({ months: monthOffset }),
    DateTime.toDateUtc
  );

const monthlyWindowFromAnchor = (
  anchor: Date,
  now: Date
): AssistantUsageWindow | undefined => {
  if (now < anchor) return undefined;
  let offset =
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    now.getUTCMonth() -
    anchor.getUTCMonth();
  let startsAt = monthlyOccurrence(anchor, offset);
  if (startsAt > now) {
    offset -= 1;
    startsAt = monthlyOccurrence(anchor, offset);
  }
  const resetsAt = monthlyOccurrence(anchor, offset + 1);
  return {
    id: startsAt.toISOString(),
    startsAt: startsAt.toISOString(),
    resetsAt: resetsAt.toISOString(),
  };
};

const stripeWindow = (
  state: UsageCycleState,
  now: Date
): AssistantUsageWindow | undefined => {
  const { billingInterval, currentPeriodEnd, currentPeriodStart } = state;
  if (
    !isValidDate(currentPeriodStart) ||
    !isValidDate(currentPeriodEnd) ||
    now < currentPeriodStart ||
    now >= currentPeriodEnd
  ) {
    return undefined;
  }
  if (billingInterval === "month") {
    return {
      id: currentPeriodStart.toISOString(),
      startsAt: currentPeriodStart.toISOString(),
      resetsAt: currentPeriodEnd.toISOString(),
    };
  }
  if (billingInterval !== "year" || !isValidDate(state.usageCycleAnchor)) {
    return undefined;
  }
  const monthly = monthlyWindowFromAnchor(state.usageCycleAnchor, now);
  if (!monthly) return undefined;
  const startsAt = DateTime.max(
    DateTime.makeUnsafe(monthly.startsAt),
    DateTime.makeUnsafe(currentPeriodStart)
  );
  const resetsAt = DateTime.min(
    DateTime.makeUnsafe(monthly.resetsAt),
    DateTime.makeUnsafe(currentPeriodEnd)
  );
  if (DateTime.toEpochMillis(resetsAt) <= DateTime.toEpochMillis(startsAt)) {
    return undefined;
  }
  const startsAtIso = DateTime.formatIso(startsAt);
  return {
    id: startsAtIso,
    startsAt: startsAtIso,
    resetsAt: DateTime.formatIso(resetsAt),
  };
};

export function resolveMonthlyUsageWindow(
  state: UsageCycleState,
  now: Date
): AssistantUsageWindow | undefined {
  return Match.value(state.source).pipe(
    Match.when("stripe", () => stripeWindow(state, now)),
    Match.when("admin", () => {
      if (!isValidDate(state.usageCycleAnchor)) return undefined;
      return monthlyWindowFromAnchor(state.usageCycleAnchor, now);
    }),
    Match.exhaustive
  );
}

export const resolveAssistantUsageWindow = resolveMonthlyUsageWindow;

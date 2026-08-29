import { Match, Schema } from "effect";

export const AssistantUsageWindow = Schema.Struct({
  id: Schema.String,
  startsAt: Schema.String,
  resetsAt: Schema.String,
});
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

const daysInUtcMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

const monthlyOccurrence = (anchor: Date, monthOffset: number): Date => {
  const absoluteMonth = anchor.getUTCMonth() + monthOffset;
  const year = anchor.getUTCFullYear() + Math.floor(absoluteMonth / 12);
  const month = ((absoluteMonth % 12) + 12) % 12;
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(anchor.getUTCDate(), daysInUtcMonth(year, month)),
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds()
    )
  );
};

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
  const startsAt = new Date(
    Math.max(new Date(monthly.startsAt).getTime(), currentPeriodStart.getTime())
  );
  const resetsAt = new Date(
    Math.min(new Date(monthly.resetsAt).getTime(), currentPeriodEnd.getTime())
  );
  if (resetsAt <= startsAt) return undefined;
  return {
    id: startsAt.toISOString(),
    startsAt: startsAt.toISOString(),
    resetsAt: resetsAt.toISOString(),
  };
};

export function resolveAssistantUsageWindow(
  state: UsageCycleState,
  now = new Date()
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

import { Duration, Schema } from "effect";

const HOT_POLL_DELAY_MS = Duration.toMillis("30 seconds");
const WARM_POLL_DELAY_MS = Duration.toMillis("1 minute");
const COOL_POLL_DELAY_MS = Duration.toMillis("2 minutes");
const IDLE_POLL_DELAY_MS = Duration.toMillis("5 minutes");

const WARM_AFTER_MS = Duration.toMillis("5 minutes");
const COOL_AFTER_MS = Duration.toMillis("30 minutes");
const IDLE_AFTER_MS = Duration.toMillis("6 hours");

const TRANSIENT_BACKOFF_BASE_MS = Duration.toMillis("1 minute");
const TRANSIENT_BACKOFF_CAP_MS = Duration.toMillis("15 minutes");
const MAX_TRANSIENT_FAILURES = 5;
const RATE_LIMIT_BUFFER_MS = Duration.toMillis("1 second");

const NonNegativeNumber = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0));
const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export const XSyncPollControl = Schema.Struct({
  idleSinceMs: Schema.NullOr(NonNegativeNumber),
  transientFailures: NonNegativeInt,
});
export type XSyncPollControl = typeof XSyncPollControl.Type;

export const activePollControl: XSyncPollControl = {
  idleSinceMs: null,
  transientFailures: 0,
};

export const pollControlsEqual = (
  left: XSyncPollControl,
  right: XSyncPollControl
): boolean =>
  left.idleSinceMs === right.idleSinceMs &&
  left.transientFailures === right.transientFailures;

export const healthyPollDelay = (
  control: XSyncPollControl,
  nowMs: number
): number => {
  if (control.idleSinceMs === null) return HOT_POLL_DELAY_MS;

  const idleForMs = Math.max(0, nowMs - control.idleSinceMs);
  if (idleForMs >= IDLE_AFTER_MS) return IDLE_POLL_DELAY_MS;
  if (idleForMs >= COOL_AFTER_MS) return COOL_POLL_DELAY_MS;
  if (idleForMs >= WARM_AFTER_MS) return WARM_POLL_DELAY_MS;
  return HOT_POLL_DELAY_MS;
};

export const pollControlAfterSuccess = (
  control: XSyncPollControl,
  newCount: number,
  nowMs: number
): XSyncPollControl => {
  if (newCount > 0) return activePollControl;
  return {
    idleSinceMs: control.idleSinceMs ?? nowMs,
    transientFailures: 0,
  };
};

export const pollControlAfterTransientFailure = (
  control: XSyncPollControl
): XSyncPollControl => ({
  ...control,
  transientFailures: Math.min(
    control.transientFailures + 1,
    MAX_TRANSIENT_FAILURES
  ),
});

export const transientFailureDelay = (control: XSyncPollControl): number => {
  const exponent = Math.max(0, control.transientFailures - 1);
  return Math.min(
    TRANSIENT_BACKOFF_BASE_MS * 2 ** exponent,
    TRANSIENT_BACKOFF_CAP_MS
  );
};

export const repairedPollDelay = (
  control: XSyncPollControl,
  nowMs: number
): number =>
  control.transientFailures > 0
    ? transientFailureDelay(control)
    : healthyPollDelay(control, nowMs);

export const rateLimitDelay = (
  control: XSyncPollControl,
  nowMs: number,
  retryAfterMs: number
): number =>
  Math.max(
    repairedPollDelay(control, nowMs),
    Math.max(0, retryAfterMs) + RATE_LIMIT_BUFFER_MS
  );

import { describe, expect, it } from "vitest";

import {
  activePollControl,
  healthyPollDelay,
  pollControlAfterSuccess,
  pollControlAfterTransientFailure,
  rateLimitDelay,
  transientFailureDelay,
} from "../poll-control";
import type { XSyncPollControl } from "../poll-control";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe("adaptive X poll control", () => {
  it("relaxes healthy polling only after sustained inactivity", () => {
    const now = 10 * HOUR;
    const idle = pollControlAfterSuccess(activePollControl, 0, now);

    expect(healthyPollDelay(idle, now)).toBe(30_000);
    expect(healthyPollDelay(idle, now + 5 * MINUTE)).toBe(MINUTE);
    expect(healthyPollDelay(idle, now + 30 * MINUTE)).toBe(2 * MINUTE);
    expect(healthyPollDelay(idle, now + 6 * HOUR)).toBe(5 * MINUTE);
  });

  it("returns to fast polling after activity", () => {
    const control = {
      idleSinceMs: 1,
      transientFailures: 4,
    } as const;

    const active = pollControlAfterSuccess(control, 2, 100_000);

    expect(active).toEqual(activePollControl);
    expect(healthyPollDelay(active, 100_000)).toBe(30_000);
  });

  it("clears transient failures after a healthy empty poll", () => {
    expect(
      pollControlAfterSuccess(
        { idleSinceMs: 1, transientFailures: 3 },
        0,
        100_000
      )
    ).toEqual({ idleSinceMs: 1, transientFailures: 0 });
  });

  it("persists bounded transient-failure backoff independently of idle cadence", () => {
    const idle: XSyncPollControl = {
      idleSinceMs: 1,
      transientFailures: 0,
    };
    const delays: number[] = [];
    let control = idle;

    for (let attempt = 0; attempt < 7; attempt += 1) {
      control = pollControlAfterTransientFailure(control);
      delays.push(transientFailureDelay(control));
    }

    expect(delays).toEqual([
      MINUTE,
      2 * MINUTE,
      4 * MINUTE,
      8 * MINUTE,
      15 * MINUTE,
      15 * MINUTE,
      15 * MINUTE,
    ]);
    expect(control.idleSinceMs).toBe(1);
    expect(control.transientFailures).toBe(5);
  });

  it("honors rate limits without accelerating the adaptive cadence", () => {
    const now = 10 * HOUR;
    const idle = {
      idleSinceMs: now - 7 * HOUR,
      transientFailures: 0,
    } as const;

    expect(rateLimitDelay(activePollControl, now, 45_000)).toBe(46_000);
    expect(rateLimitDelay(idle, now, 45_000)).toBe(5 * MINUTE);
  });

  it("treats a clock moving backwards as active rather than over-delaying", () => {
    expect(
      healthyPollDelay({ idleSinceMs: 100_000, transientFailures: 0 }, 90_000)
    ).toBe(30_000);
  });
});

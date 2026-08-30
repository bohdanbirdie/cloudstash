import { describe, expect, it } from "vitest";

import { resolveAssistantUsageWindow } from "../usage-cycle";

const date = (value: string) => new Date(value);

describe("Assistant usage cycle", () => {
  it("uses Stripe's exact monthly item period", () => {
    expect(
      resolveAssistantUsageWindow(
        {
          source: "stripe",
          billingInterval: "month",
          currentPeriodStart: date("2026-08-17T14:30:00.000Z"),
          currentPeriodEnd: date("2026-09-17T14:30:00.000Z"),
          usageCycleAnchor: date("2026-01-17T14:30:00.000Z"),
        },
        date("2026-08-29T12:00:00.000Z")
      )
    ).toEqual({
      id: "2026-08-17T14:30:00.000Z",
      startsAt: "2026-08-17T14:30:00.000Z",
      resetsAt: "2026-09-17T14:30:00.000Z",
    });
  });

  it("derives monthly windows inside a yearly Stripe period", () => {
    expect(
      resolveAssistantUsageWindow(
        {
          source: "stripe",
          billingInterval: "year",
          currentPeriodStart: date("2026-01-17T14:30:00.000Z"),
          currentPeriodEnd: date("2027-01-17T14:30:00.000Z"),
          usageCycleAnchor: date("2026-01-17T14:30:00.000Z"),
        },
        date("2026-08-29T12:00:00.000Z")
      )
    ).toEqual({
      id: "2026-08-17T14:30:00.000Z",
      startsAt: "2026-08-17T14:30:00.000Z",
      resetsAt: "2026-09-17T14:30:00.000Z",
    });
  });

  it("clamps day-31 anchors to the end of shorter months", () => {
    expect(
      resolveAssistantUsageWindow(
        {
          source: "admin",
          billingInterval: null,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          usageCycleAnchor: date("2026-01-31T09:15:00.000Z"),
        },
        date("2026-02-28T10:00:00.000Z")
      )
    ).toEqual({
      id: "2026-02-28T09:15:00.000Z",
      startsAt: "2026-02-28T09:15:00.000Z",
      resetsAt: "2026-03-31T09:15:00.000Z",
    });
  });

  it("keeps leap-day anchors deterministic", () => {
    expect(
      resolveAssistantUsageWindow(
        {
          source: "admin",
          billingInterval: null,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          usageCycleAnchor: date("2024-02-29T18:00:00.000Z"),
        },
        date("2025-02-28T19:00:00.000Z")
      )?.resetsAt
    ).toBe("2025-03-29T18:00:00.000Z");
  });

  it("fails closed when Stripe cycle data is missing or stale", () => {
    expect(
      resolveAssistantUsageWindow(
        {
          source: "stripe",
          billingInterval: "year",
          currentPeriodStart: null,
          currentPeriodEnd: date("2027-01-17T14:30:00.000Z"),
          usageCycleAnchor: null,
        },
        date("2026-08-29T12:00:00.000Z")
      )
    ).toBeUndefined();
  });
});

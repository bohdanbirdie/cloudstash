import { describe, expect, it } from "@effect/vitest";

import { isoWeek } from "../iso-week";

describe("isoWeek", () => {
  it.each([
    ["2026-05-23T12:00:00Z", "2026-W21"],
    ["2026-01-01T00:00:00Z", "2026-W01"],
    ["2024-12-30T00:00:00Z", "2025-W01"],
    ["2023-01-01T00:00:00Z", "2022-W52"],
    ["2020-12-31T00:00:00Z", "2020-W53"],
    ["2021-01-01T00:00:00Z", "2020-W53"],
    ["2026-05-24T00:00:00Z", "2026-W21"],
    ["2026-12-28T00:00:00Z", "2026-W53"],
  ])("%s → %s", (input, expected) => {
    expect(isoWeek(new Date(input))).toBe(expected);
  });
});

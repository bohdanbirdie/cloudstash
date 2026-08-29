// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { UsageLimits } from "@/components/usage/usage-limits";

afterEach(cleanup);

describe("usage limits", () => {
  it("shares one UTC reset date across several limits", () => {
    render(
      <UsageLimits
        items={[
          {
            id: "assistant",
            label: "Cloudstash Assistant",
            limit: 1_000,
            remaining: 842,
          },
          {
            id: "summaries",
            label: "AI summaries",
            limit: 100,
            remaining: 37,
          },
        ]}
        resetsAt="2026-09-01T00:00:00.000Z"
      />
    );

    expect(screen.getAllByText("Monthly limits reset Sep 1")).toHaveLength(1);
    expect(screen.getAllByRole("progressbar")).toHaveLength(2);
  });
});

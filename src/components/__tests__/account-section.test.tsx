// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountSectionView } from "@/components/settings/sections/account-section";

afterEach(cleanup);

describe("account usage", () => {
  it("shows the public Assistant allowance without private accounting details", () => {
    render(
      <AccountSectionView
        assistantCredits={{
          limit: 1_000,
          remaining: 842,
          resetsAt: "2026-09-01T00:00:00.000Z",
        }}
        email="alex@example.com"
        image={null}
        name="Alex Morgan"
        onDeleteAccount={vi.fn()}
        showAssistantCredits
      />
    );

    expect(screen.getByText("Usage")).toBeTruthy();
    expect(screen.getByText("Cloudstash Assistant")).toBeTruthy();
    expect(screen.getByText("842")).toBeTruthy();
    expect(screen.getByText("of 1,000 left")).toBeTruthy();
    expect(screen.getByText("Monthly limits reset Sep 1")).toBeTruthy();
    expect(screen.queryByText(/\$/)).toBeNull();
  });
});

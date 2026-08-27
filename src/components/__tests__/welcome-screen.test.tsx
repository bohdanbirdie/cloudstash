// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WelcomeScreen } from "@/components/billing/welcome-screen";
import type { WelcomeScreenProps } from "@/components/billing/welcome-screen";

const defaultProps = {
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
  isFallback: false,
  isLoading: false,
  libraryLink: <a href="/inbox">Go to your library</a>,
  onRetry: vi.fn(),
  onResume: vi.fn(),
  tier: "pro",
} satisfies WelcomeScreenProps;

function renderWelcome(overrides: Partial<WelcomeScreenProps> = {}) {
  return render(<WelcomeScreen {...defaultProps} {...overrides} />);
}

describe("WelcomeScreen", () => {
  afterEach(() => {
    cleanup();
    defaultProps.onRetry.mockReset();
    defaultProps.onResume.mockReset();
  });

  it("focuses the confirmation on benefits introduced by the active tier", () => {
    renderWelcome();

    expect(screen.getByRole("heading", { name: "You’re on Pro" })).toBeTruthy();
    expect(screen.getByText("X bookmark sync")).toBeTruthy();
    expect(screen.getByText("MCP server")).toBeTruthy();
    expect(screen.queryByText("AI summary on every save")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Go to your library" })
    ).toBeTruthy();
  });

  it("offers a retry when the latest billing state cannot be confirmed", async () => {
    const onRetry = vi.fn();
    renderWelcome({ isFallback: true, onRetry });

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(onRetry).toHaveBeenCalledOnce());
    expect(
      screen.getByRole("link", { name: "Go to your library" })
    ).toBeTruthy();
  });

  it("describes scheduled cancellation without implying access ended", () => {
    renderWelcome({
      cancelAtPeriodEnd: true,
      currentPeriodEnd: "2026-09-30T00:00:00.000Z",
      tier: "plus",
    });

    expect(screen.getByText("Cancellation scheduled")).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        name: /Plus stays active until September 30, 2026/,
      })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resume Plus" })).toBeTruthy();
  });

  it("announces the indeterminate loading state", () => {
    renderWelcome({ isLoading: true });

    expect(screen.getByRole("status").textContent).toContain(
      "Confirming your plan"
    );
    expect(screen.getByText("Confirming your plan…")).toBeTruthy();
  });
});

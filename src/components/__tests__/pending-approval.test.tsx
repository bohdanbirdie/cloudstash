// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const logout = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ logout }));
vi.mock("@/components/use-redeem-invite", () => ({
  useRedeemInvite: () => ({
    clearError: vi.fn(),
    error: null,
    isRedeeming: false,
    redeem: vi.fn(),
  }),
}));
vi.mock("@/components/settings/delete-account-dialog", () => ({
  DeleteAccountDialog: ({ open }: { open: boolean }) => (
    <div data-testid="delete-account-dialog" data-open={open} />
  ),
}));

import { PendingApproval } from "@/components/pending-approval";

describe("PendingApproval", () => {
  afterEach(() => {
    cleanup();
    logout.mockReset();
  });

  it("keeps sign-out and account deletion available while approval is pending", () => {
    render(<PendingApproval />);

    fireEvent.click(
      screen.getByRole("button", { name: "Use a different account" })
    );
    expect(logout).toHaveBeenCalledOnce();

    expect(
      screen.getByTestId("delete-account-dialog").getAttribute("data-open")
    ).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    expect(
      screen.getByTestId("delete-account-dialog").getAttribute("data-open")
    ).toBe("true");
  });
});

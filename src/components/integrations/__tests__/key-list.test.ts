// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { KeyList } from "../key-list";

const key = {
  createdAt: new Date("2026-08-26T00:00:00Z"),
  id: "key-1",
  lastRequest: null,
  name: "Chrome Extension",
};

describe("KeyList", () => {
  afterEach(cleanup);

  it("keeps failed revocation confirmable without duplicate requests", async () => {
    let finishRevocation: ((revoked: boolean) => void) | undefined;
    let revokeCount = 0;
    const onRevoke = () => {
      revokeCount += 1;
      return new Promise<boolean>((resolve) => {
        finishRevocation = resolve;
      });
    };

    render(
      createElement(KeyList, {
        isLoading: false,
        keys: [key],
        onRevoke,
      })
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Revoke Chrome Extension" })
    );
    expect(document.activeElement).toBe(
      screen.getByRole("button", {
        name: "Cancel revoking Chrome Extension",
      })
    );

    const confirm = screen.getByRole("button", {
      name: "Confirm revoking Chrome Extension",
    });
    confirm.focus();
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(revokeCount).toBe(1);
    expect(
      screen
        .getByRole("button", { name: "Revoking Chrome Extension" })
        .getAttribute("aria-busy")
    ).toBe("true");

    await act(async () => finishRevocation?.(false));

    expect(document.activeElement).toBe(
      screen.getByRole("button", {
        name: "Confirm revoking Chrome Extension",
      })
    );
  });
});

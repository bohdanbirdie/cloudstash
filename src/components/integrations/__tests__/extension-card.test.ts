// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { ExtensionCard } from "../extension-card";

const extensionKey = {
  createdAt: new Date("2026-08-26T00:00:00Z"),
  id: "chrome-key",
  lastRequest: null,
  name: "Chrome Extension",
};

describe("ExtensionCard", () => {
  afterEach(cleanup);

  it("removes device details when the final connection disappears", () => {
    const renderCard = (keys: (typeof extensionKey)[]) =>
      createElement(ExtensionCard, {
        isLoading: false,
        keys,
        onRevokeKey: async () => true,
      });
    const view = render(renderCard([extensionKey]));

    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    expect(screen.getByText("Chrome Extension")).toBeTruthy();

    view.rerender(renderCard([]));

    expect(screen.getByRole("button", { name: "Install" })).toBeTruthy();
    expect(screen.queryByText("No API keys yet")).toBeNull();
  });
});

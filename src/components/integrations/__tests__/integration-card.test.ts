// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { DisconnectButton, IntegrationItem } from "../integration-card";

describe("DisconnectButton", () => {
  afterEach(cleanup);

  it("disconnects directly with an integration-specific accessible name", () => {
    let disconnectCount = 0;

    render(
      createElement(DisconnectButton, {
        integration: "X",
        isPending: false,
        onClick: () => {
          disconnectCount += 1;
        },
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Disconnect X" }));

    expect(disconnectCount).toBe(1);
  });

  it("announces a pending disconnect", () => {
    render(
      createElement(DisconnectButton, {
        integration: "Telegram",
        isPending: true,
        onClick: () => undefined,
      })
    );

    const button = screen.getByRole("button", {
      name: "Disconnecting Telegram",
    });
    expect(button.getAttribute("aria-busy")).toBe("true");
  });
});

describe("IntegrationItem", () => {
  afterEach(cleanup);

  it("moves focus to a replacement control", () => {
    const renderItem = (controlKey: string, label: string) =>
      createElement(IntegrationItem, {
        control: createElement("button", { type: "button" }, label),
        controlKey,
        description: "Sync new bookmarks",
        icon: null,
        title: "X",
      });
    const view = render(renderItem("connected", "Disconnect"));
    const disconnect = screen.getByRole("button", { name: "Disconnect" });
    disconnect.focus();

    view.rerender(renderItem("disconnected", "Connect"));

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Connect" })
    );
  });
});

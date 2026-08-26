// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://cloudstash.test/settings"}

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { McpCard } from "../mcp-card";

const { copyState, orgFeatures } = vi.hoisted(() => ({
  copyState: {
    copied: false,
    copy: vi.fn(),
    copyFailed: false,
  },
  orgFeatures: {
    capabilities: { mcpServer: true },
    error: null as Error | null,
    isFallback: false,
    isLoading: false,
    isRefreshing: false,
    retry: vi.fn(() => Promise.resolve()),
    tier: "pro",
  },
}));

vi.mock("@/hooks/use-copy-to-clipboard", () => ({
  useCopyToClipboard: () => copyState,
}));

vi.mock("@/hooks/use-org-features", () => ({
  useOrgFeatures: () => orgFeatures,
}));

describe("McpCard", () => {
  beforeEach(() => {
    copyState.copied = false;
    copyState.copyFailed = false;
    copyState.copy.mockReset();
    orgFeatures.capabilities.mcpServer = true;
    orgFeatures.error = null;
    orgFeatures.isFallback = false;
    orgFeatures.isLoading = false;
    orgFeatures.isRefreshing = false;
    orgFeatures.retry.mockReset();
    orgFeatures.retry.mockResolvedValue(undefined);
    orgFeatures.tier = "pro";
  });

  afterEach(cleanup);

  it("offers an agent installer and the raw MCP server URL", () => {
    render(createElement(McpCard));

    expect(screen.getByRole("heading", { level: 3, name: "MCP" })).toBeTruthy();
    expect(screen.queryByText("Available")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByText("Connect in your agent")).toBeTruthy();
    expect(screen.getByText("MCP server URL")).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: "MCP server URL value" })
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Copy Connect in your agent" })
    );
    expect(copyState.copy).toHaveBeenNthCalledWith(
      1,
      "npx add-mcp https://cloudstash.test/mcp --name cloudstash --global"
    );

    expect(
      screen.getByRole("button", { name: "Copy MCP server URL" })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Connection details" })
    ).toBeNull();
  });

  it("offers an inline retry when capability loading fails", () => {
    orgFeatures.capabilities.mcpServer = false;
    orgFeatures.error = new Error("offline");
    orgFeatures.isFallback = true;

    render(createElement(McpCard));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(orgFeatures.retry).toHaveBeenCalledOnce();
    expect(screen.queryByText("Upgrade to Pro")).toBeNull();
  });

  it("shows an actionable manual-copy fallback", () => {
    copyState.copyFailed = true;

    render(createElement(McpCard));
    fireEvent.click(
      screen.getByRole("button", { name: "Copy Connect in your agent" })
    );

    expect(
      screen.getAllByText("Copy failed. Select and copy manually.")
    ).toHaveLength(2);
  });
});

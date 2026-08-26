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

  it("leads with client-specific setup and progressively discloses protocol details", () => {
    render(createElement(McpCard));

    expect(screen.getByRole("heading", { level: 3, name: "MCP" })).toBeTruthy();
    expect(screen.queryByText("Available")).toBeNull();
    expect(screen.getByRole("tab", { name: "Claude Code" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Codex" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "OpenCode" })).toBeTruthy();

    const copyButton = screen.getByRole("button", { name: "Copy setup" });
    fireEvent.click(copyButton);
    expect(copyState.copy).toHaveBeenCalledWith(
      "claude mcp add --transport http --scope user cloudstash https://cloudstash.test/mcp"
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Advanced connection details" })
    );
    expect(screen.getByText("https://cloudstash.test/mcp")).toBeTruthy();
    expect(screen.getByText("Dynamic Client Registration (DCR)")).toBeTruthy();
    expect(screen.getByText("links:read links:write")).toBeTruthy();
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
    fireEvent.click(screen.getByRole("button", { name: "Copy setup" }));

    expect(
      screen.getByText(
        "Copy failed. Select the setup text and copy it manually."
      )
    ).toBeTruthy();
  });
});

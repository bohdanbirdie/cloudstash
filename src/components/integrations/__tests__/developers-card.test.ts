// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { DevelopersCard } from "../developers-card";
import { resolveSource } from "../use-api-keys";
import type { ApiKey, IntegrationSource } from "../use-api-keys";

// Regression: FE-09-A.
//
// First-party integration keys are managed by their own integration cards and
// must not appear in the Developers list. Filtering on the display name missed
// Chrome Extension entirely, so an extension key was listed here as well and
// revoking it from this list silently broke the browser extension.
//
// Keys are now tagged with metadata.source by the server
// (connect/extension.ts, connect/raycast.ts, connect/telegram.ts) and the
// client resolves that into ApiKey.source.

const key = (
  name: string,
  id: string,
  source: IntegrationSource | null
): ApiKey => ({
  createdAt: new Date("2026-08-26T00:00:00Z"),
  id,
  lastRequest: null,
  name,
  source,
});

const renderCard = (keys: ApiKey[]) =>
  render(
    createElement(DevelopersCard, {
      isGenerating: false,
      isLoading: false,
      keys,
      onGenerateKey: async () => null,
      onRevokeKey: async () => true,
      publicApiAvailable: true,
    })
  );

describe("DevelopersCard", () => {
  afterEach(cleanup);

  it("lists a genuine developer key", () => {
    renderCard([key("My script", "dev-1", null)]);
    expect(screen.getByText("My script")).toBeTruthy();
  });

  it.each([
    ["Raycast Extension", "raycast-1", "raycast"],
    ["Raycast — Bohdan's Mac", "raycast-2", "raycast"],
    ["Telegram", "telegram-1", "telegram"],
    ["Chrome Extension", "chrome-1", "chrome-extension"],
  ] as const)("hides the first-party key %s", (name, id, source) => {
    renderCard([key(name, id, source), key("My script", "dev-1", null)]);

    expect(screen.getByText("My script")).toBeTruthy();
    expect(screen.queryByText(name)).toBeNull();
  });

  it("hides an integration key whose name a user renamed", () => {
    renderCard([
      key("my laptop", "chrome-2", "chrome-extension"),
      key("My script", "dev-1", null),
    ]);

    expect(screen.getByText("My script")).toBeTruthy();
    expect(screen.queryByText("my laptop")).toBeNull();
  });
});

describe("resolveSource", () => {
  it("prefers the server-supplied metadata tag", () => {
    expect(
      resolveSource({ metadata: { source: "raycast" }, name: "anything" })
    ).toBe("raycast");
  });

  it.each([
    ["Chrome Extension", "chrome-extension"],
    ["Raycast Extension", "raycast"],
    ["Raycast — Bohdan's Mac", "raycast"],
    ["Telegram", "telegram"],
  ])("falls back to the legacy name %s", (name, expected) => {
    expect(resolveSource({ name })).toBe(expected);
  });

  it.each([
    [{ name: "My script" }],
    [{ metadata: null, name: "My script" }],
    [{ metadata: { source: "not-a-source" }, name: "My script" }],
    [{ metadata: "garbage", name: "My script" }],
    [{ name: null }],
  ])("returns null for a developer key %#", (input) => {
    expect(resolveSource(input)).toBeNull();
  });
});

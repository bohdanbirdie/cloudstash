// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { DevelopersCard } from "../developers-card";
import type { ApiKey } from "../use-api-keys";

// Regression: FE-09-A.
//
// First-party integration keys are meant to stay out of the Developers list —
// they are managed by their own integration cards. The filter in
// developers-card.tsx excludes Raycast and Telegram by display name and omits
// Chrome Extension, so an extension key is listed here as well, unlabelled.
// Revoking it from this list silently breaks the browser extension.
//
// The server already tags every first-party key with metadata.source
// (connect/extension.ts, connect/raycast.ts, connect/telegram.ts), but
// use-api-keys.ts drops metadata from the client type.

const key = (name: string, id: string): ApiKey => ({
  createdAt: new Date("2026-08-26T00:00:00Z"),
  id,
  lastRequest: null,
  name,
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
    renderCard([key("My script", "dev-1")]);
    expect(screen.getByText("My script")).toBeTruthy();
  });

  it.each([
    ["Raycast Extension", "raycast-1"],
    ["Raycast — Bohdan's Mac", "raycast-2"],
    ["Telegram", "telegram-1"],
    ["Chrome Extension", "chrome-1"],
  ])("hides the first-party key %s", (name, id) => {
    renderCard([key(name, id), key("My script", "dev-1")]);

    expect(screen.getByText("My script")).toBeTruthy();
    expect(screen.queryByText(name)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { topmostScope } from "../keyboard";

describe("topmostScope", () => {
  it("popover wins over everything", () => {
    expect(
      topmostScope(["global", "detail", "selection", "dialog", "popover"])
    ).toBe("popover");
  });

  it("dialog wins below popover", () => {
    expect(topmostScope(["global", "detail", "selection", "dialog"])).toBe(
      "dialog"
    );
  });

  it("dock wins below dialog", () => {
    expect(topmostScope(["global", "detail", "selection", "dock"])).toBe(
      "dock"
    );
  });

  it("selection wins below dock", () => {
    expect(topmostScope(["global", "detail", "selection"])).toBe("selection");
  });

  it("detail wins below selection", () => {
    expect(topmostScope(["global", "detail"])).toBe("detail");
  });

  it("global is the floor", () => {
    expect(topmostScope(["global"])).toBe("global");
  });

  it("returns null when nothing is active", () => {
    expect(topmostScope([])).toBe(null);
  });

  it("ignores unknown scopes", () => {
    expect(topmostScope(["global", "unknown"])).toBe("global");
  });
});

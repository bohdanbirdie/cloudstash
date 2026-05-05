import { describe, expect, it } from "vitest";

import {
  anchorAfterHover,
  arrowOpensDetail,
  cursor,
  moveTarget,
} from "../list-nav-rules";

type Item = { id: string };
const ITEMS: readonly Item[] = [
  { id: "a" },
  { id: "b" },
  { id: "c" },
  { id: "d" },
];

describe("cursor", () => {
  it("prefers activeId over anchorId", () => {
    expect(cursor({ activeId: "b", anchorId: "c" })).toBe("b");
  });
  it("falls back to anchorId when no activeId", () => {
    expect(cursor({ activeId: null, anchorId: "c" })).toBe("c");
  });
  it("returns null when both are null", () => {
    expect(cursor({ activeId: null, anchorId: null })).toBe(null);
  });
});

describe("anchorAfterHover", () => {
  it("updates anchor to hovered when no activeId", () => {
    expect(anchorAfterHover({ activeId: null, anchorId: "a" }, "c")).toBe("c");
  });
  it("preserves anchor when activeId is set", () => {
    expect(anchorAfterHover({ activeId: "b", anchorId: "a" }, "c")).toBe("a");
  });
  it("preserves null anchor when activeId is set", () => {
    expect(anchorAfterHover({ activeId: "b", anchorId: null }, "c")).toBe(null);
  });
});

describe("moveTarget", () => {
  it("lands on first item when both refs are null", () => {
    expect(moveTarget({ activeId: null, anchorId: null }, ITEMS, 1)).toBe("a");
  });
  it("advances by delta from activeId", () => {
    expect(moveTarget({ activeId: "b", anchorId: null }, ITEMS, 1)).toBe("c");
  });
  it("falls back to anchorId when no activeId", () => {
    expect(moveTarget({ activeId: null, anchorId: "b" }, ITEMS, 1)).toBe("c");
  });
  it("clamps at the end", () => {
    expect(moveTarget({ activeId: "d", anchorId: null }, ITEMS, 1)).toBe("d");
  });
  it("home goes to first", () => {
    expect(moveTarget({ activeId: "c", anchorId: null }, ITEMS, "home")).toBe(
      "a"
    );
  });
  it("end goes to last", () => {
    expect(moveTarget({ activeId: "a", anchorId: null }, ITEMS, "end")).toBe(
      "d"
    );
  });
  it("returns null for empty list", () => {
    expect(moveTarget({ activeId: null, anchorId: null }, [], 1)).toBe(null);
  });
});

describe("arrowOpensDetail", () => {
  it("opens when activeId is set and target differs", () => {
    expect(arrowOpensDetail({ activeId: "a", anchorId: null }, "b")).toBe(true);
  });
  it("does not open when activeId is null", () => {
    expect(arrowOpensDetail({ activeId: null, anchorId: "a" }, "b")).toBe(
      false
    );
  });
  it("does not open when target equals activeId", () => {
    expect(arrowOpensDetail({ activeId: "a", anchorId: null }, "a")).toBe(
      false
    );
  });
});

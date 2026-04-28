// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearKeyboardFocusFromOtherRow,
  computeTargetIndex,
  findRowInContainer,
  focusRowById,
} from "../listbox-keyboard";

type Item = { id: string };

const ITEMS: readonly Item[] = [
  { id: "a" },
  { id: "b" },
  { id: "c" },
  { id: "d" },
];

describe("computeTargetIndex", () => {
  it("returns -1 when items is empty", () => {
    expect(computeTargetIndex<Item>([], null, 1)).toBe(-1);
    expect(computeTargetIndex<Item>([], "a", 1)).toBe(-1);
    expect(computeTargetIndex<Item>([], null, "home")).toBe(-1);
    expect(computeTargetIndex<Item>([], null, "end")).toBe(-1);
  });

  it("returns 0 for home", () => {
    expect(computeTargetIndex(ITEMS, "c", "home")).toBe(0);
    expect(computeTargetIndex(ITEMS, null, "home")).toBe(0);
  });

  it("returns last index for end", () => {
    expect(computeTargetIndex(ITEMS, "a", "end")).toBe(3);
    expect(computeTargetIndex(ITEMS, null, "end")).toBe(3);
  });

  it("returns 0 when cursor is null (cold start)", () => {
    expect(computeTargetIndex(ITEMS, null, 1)).toBe(0);
    expect(computeTargetIndex(ITEMS, null, -1)).toBe(0);
  });

  it("returns 0 when cursorId is not in items (cold start fallback)", () => {
    expect(computeTargetIndex(ITEMS, "missing", 1)).toBe(0);
    expect(computeTargetIndex(ITEMS, "missing", -1)).toBe(0);
  });

  it("moves +1 from start", () => {
    expect(computeTargetIndex(ITEMS, "a", 1)).toBe(1);
  });

  it("moves +1 from middle", () => {
    expect(computeTargetIndex(ITEMS, "b", 1)).toBe(2);
  });

  it("clamps +1 at the end", () => {
    expect(computeTargetIndex(ITEMS, "d", 1)).toBe(3);
  });

  it("moves -1 from end", () => {
    expect(computeTargetIndex(ITEMS, "d", -1)).toBe(2);
  });

  it("moves -1 from middle", () => {
    expect(computeTargetIndex(ITEMS, "c", -1)).toBe(1);
  });

  it("clamps -1 at the start", () => {
    expect(computeTargetIndex(ITEMS, "a", -1)).toBe(0);
  });

  it("supports larger positive deltas with clamping", () => {
    expect(computeTargetIndex(ITEMS, "a", 2)).toBe(2);
    expect(computeTargetIndex(ITEMS, "a", 3)).toBe(3);
    expect(computeTargetIndex(ITEMS, "a", 99)).toBe(3);
  });

  it("supports larger negative deltas with clamping", () => {
    expect(computeTargetIndex(ITEMS, "d", -2)).toBe(1);
    expect(computeTargetIndex(ITEMS, "d", -3)).toBe(0);
    expect(computeTargetIndex(ITEMS, "d", -99)).toBe(0);
  });

  it("treats delta of 0 as no movement from a known cursor", () => {
    expect(computeTargetIndex(ITEMS, "b", 0)).toBe(1);
  });

  it("works on a single-item list", () => {
    const single: readonly Item[] = [{ id: "only" }];
    expect(computeTargetIndex(single, null, "home")).toBe(0);
    expect(computeTargetIndex(single, null, "end")).toBe(0);
    expect(computeTargetIndex(single, "only", 1)).toBe(0);
    expect(computeTargetIndex(single, "only", -1)).toBe(0);
  });
});

describe("findRowInContainer", () => {
  let container: HTMLDivElement;
  let rowA: HTMLDivElement;
  let inner: HTMLSpanElement;
  let rowNoId: HTMLDivElement;
  let outsideRow: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    rowA = document.createElement("div");
    rowA.setAttribute("data-id", "a");
    inner = document.createElement("span");
    inner.textContent = "deep";
    rowA.appendChild(inner);
    container.appendChild(rowA);

    rowNoId = document.createElement("div");
    container.appendChild(rowNoId);

    outsideRow = document.createElement("div");
    outsideRow.setAttribute("data-id", "outside");

    document.body.appendChild(container);
    document.body.appendChild(outsideRow);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns null when target is not an Element (e.g. null)", () => {
    expect(findRowInContainer(null, container)).toBeNull();
  });

  it("returns null when target is outside the container", () => {
    expect(findRowInContainer(outsideRow, container)).toBeNull();
  });

  it("returns the row when target is inside it", () => {
    expect(findRowInContainer(rowA, container)).toBe(rowA);
  });

  it("returns the row when target is nested deep inside the row", () => {
    expect(findRowInContainer(inner, container)).toBe(rowA);
  });

  it("returns null when target IS the container (no [data-id] ancestor)", () => {
    expect(findRowInContainer(container, container)).toBeNull();
  });

  it("returns null when target has no [data-id] ancestor", () => {
    expect(findRowInContainer(rowNoId, container)).toBeNull();
  });

  it("returns null when container is null", () => {
    expect(findRowInContainer(rowA, null)).toBeNull();
  });
});

describe("focusRowById", () => {
  let container: HTMLDivElement;
  let rowA: HTMLDivElement;
  let rowB: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    rowA = document.createElement("div");
    rowA.setAttribute("data-id", "a");
    rowA.tabIndex = 0;
    rowB = document.createElement("div");
    rowB.setAttribute("data-id", "b");
    rowB.tabIndex = 0;
    container.appendChild(rowA);
    container.appendChild(rowB);
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("focuses the matching row", () => {
    const spy = vi.spyOn(rowB, "focus");
    focusRowById(container, "b");

    expect(spy).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(rowB);
  });

  it("calls focus with preventScroll: true", () => {
    const spy = vi.spyOn(rowA, "focus");
    focusRowById(container, "a");

    expect(spy).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("is a no-op when the id does not match any row", () => {
    const spyA = vi.spyOn(rowA, "focus");
    const spyB = vi.spyOn(rowB, "focus");
    focusRowById(container, "missing");

    expect(spyA).not.toHaveBeenCalled();
    expect(spyB).not.toHaveBeenCalled();
  });

  it("is a no-op when container is null", () => {
    expect(() => focusRowById(null, "a")).not.toThrow();
    expect(document.activeElement).toBe(document.body);
  });
});

describe("clearKeyboardFocusFromOtherRow", () => {
  let container: HTMLDivElement;
  let rowA: HTMLDivElement;
  let rowB: HTMLDivElement;
  let nonRow: HTMLDivElement;
  let outsideRow: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");

    rowA = document.createElement("div");
    rowA.setAttribute("data-id", "a");
    rowA.tabIndex = 0;

    rowB = document.createElement("div");
    rowB.setAttribute("data-id", "b");
    rowB.tabIndex = 0;

    nonRow = document.createElement("div");
    nonRow.tabIndex = 0;

    container.appendChild(rowA);
    container.appendChild(rowB);
    container.appendChild(nonRow);

    outsideRow = document.createElement("div");
    outsideRow.setAttribute("data-id", "outside");
    outsideRow.tabIndex = 0;

    document.body.appendChild(container);
    document.body.appendChild(outsideRow);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("blurs a different focused row inside the container", () => {
    rowB.focus();
    expect(document.activeElement).toBe(rowB);

    const blurSpy = vi.spyOn(rowB, "blur");
    clearKeyboardFocusFromOtherRow(container, rowA);

    expect(blurSpy).toHaveBeenCalledTimes(1);
  });

  it("does not blur the current row", () => {
    rowA.focus();
    const blurSpy = vi.spyOn(rowA, "blur");
    clearKeyboardFocusFromOtherRow(container, rowA);

    expect(blurSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(rowA);
  });

  it("does not blur if active element is outside the container", () => {
    outsideRow.focus();
    expect(document.activeElement).toBe(outsideRow);

    const blurSpy = vi.spyOn(outsideRow, "blur");
    clearKeyboardFocusFromOtherRow(container, rowA);

    expect(blurSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(outsideRow);
  });

  it("does not blur if active element is not a [data-id] element", () => {
    nonRow.focus();
    expect(document.activeElement).toBe(nonRow);

    const blurSpy = vi.spyOn(nonRow, "blur");
    clearKeyboardFocusFromOtherRow(container, rowA);

    expect(blurSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(nonRow);
  });
});

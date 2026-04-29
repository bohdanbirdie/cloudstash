import { beforeEach, describe, expect, it } from "vitest";

import { useSelectionStore } from "@/stores/selection-store";

import { removeStaleIds, selectRange, toggleSelection } from "../selection";

describe("toggleSelection", () => {
  it("adds an id when not present", () => {
    const next = toggleSelection(new Set(["a"]), "b");
    expect([...next]).toEqual(["a", "b"]);
  });

  it("removes an id when present", () => {
    const next = toggleSelection(new Set(["a", "b"]), "a");
    expect([...next]).toEqual(["b"]);
  });

  it("returns a new Set instance", () => {
    const prev = new Set(["a"]);
    const next = toggleSelection(prev, "a");
    expect(next).not.toBe(prev);
    expect(prev.has("a")).toBe(true);
  });

  it("works on an empty Set", () => {
    expect([...toggleSelection(new Set(), "x")]).toEqual(["x"]);
  });
});

describe("selectRange", () => {
  const allIds = ["a", "b", "c", "d", "e"] as const;

  it("fills ids between anchor and target inclusive", () => {
    const next = selectRange(new Set(), 1, 3, allIds);
    expect([...next].toSorted()).toEqual(["b", "c", "d"]);
  });

  it("handles target before anchor", () => {
    const next = selectRange(new Set(), 3, 1, allIds);
    expect([...next].toSorted()).toEqual(["b", "c", "d"]);
  });

  it("preserves existing selection outside the range", () => {
    const next = selectRange(new Set(["a"]), 2, 3, allIds);
    expect([...next].toSorted()).toEqual(["a", "c", "d"]);
  });

  it("works when anchor === target", () => {
    const next = selectRange(new Set(), 2, 2, allIds);
    expect([...next]).toEqual(["c"]);
  });

  it("returns a new Set instance", () => {
    const prev = new Set(["a"]);
    const next = selectRange(prev, 0, 1, allIds);
    expect(next).not.toBe(prev);
    expect([...prev]).toEqual(["a"]);
  });
});

describe("removeStaleIds", () => {
  it("drops ids absent from the valid set", () => {
    const next = removeStaleIds(new Set(["a", "b", "c"]), new Set(["a", "c"]));
    expect([...next].toSorted()).toEqual(["a", "c"]);
  });

  it("returns an empty Set when all ids are stale", () => {
    const next = removeStaleIds(new Set(["a", "b"]), new Set());
    expect(next.size).toBe(0);
  });

  it("returns an empty Set when input is empty", () => {
    const next = removeStaleIds(new Set(), new Set(["a"]));
    expect(next.size).toBe(0);
  });

  it("keeps every id when all are still valid", () => {
    const next = removeStaleIds(new Set(["a", "b"]), new Set(["a", "b", "c"]));
    expect([...next].toSorted()).toEqual(["a", "b"]);
  });
});

describe("selectionStore.removeStale", () => {
  beforeEach(() => {
    useSelectionStore.getState().clear();
  });

  it("keeps anchor when some ids survive", () => {
    const store = useSelectionStore.getState();
    store.toggle("a", 0);
    store.toggle("b", 1);
    expect(useSelectionStore.getState().anchorIndex).toBe(1);

    useSelectionStore.getState().removeStale(new Set(["a"]));
    expect([...useSelectionStore.getState().selectedIds]).toEqual(["a"]);
    expect(useSelectionStore.getState().anchorIndex).toBe(1);
  });

  it("clears anchor when every id is filtered out", () => {
    const store = useSelectionStore.getState();
    store.toggle("a", 0);
    store.toggle("b", 1);
    expect(useSelectionStore.getState().anchorIndex).toBe(1);

    useSelectionStore.getState().removeStale(new Set(["c"]));
    expect(useSelectionStore.getState().selectedIds.size).toBe(0);
    expect(useSelectionStore.getState().anchorIndex).toBeNull();
  });

  it("is a no-op when nothing is stale", () => {
    const store = useSelectionStore.getState();
    store.toggle("a", 2);
    const before = useSelectionStore.getState();

    useSelectionStore.getState().removeStale(new Set(["a", "b"]));
    expect(useSelectionStore.getState().selectedIds).toBe(before.selectedIds);
    expect(useSelectionStore.getState().anchorIndex).toBe(2);
  });
});

import { describe, expect, it } from "vitest";

import { transition } from "../selection-model";
import type { State } from "../selection-model";

const ALL = ["a", "b", "c", "d", "e"] as const;

const state = (overrides: Partial<State> = {}): State => ({
  activeId: null,
  allIds: ALL,
  anchor: null,
  ids: new Set(),
  ...overrides,
});

const ids = (set: ReadonlySet<string>) => [...set].toSorted();

describe("transition › click › meta", () => {
  it("promotes the active link into a 2-item selection when nothing was selected", () => {
    const next = transition(state({ activeId: "a" }), {
      id: "c",
      modifier: "meta",
      type: "click",
    });
    expect(ids(next.ids)).toEqual(["a", "c"]);
    expect(next.anchor).toBe("c");
  });

  it("does NOT promote when there is already a selection", () => {
    const next = transition(
      state({ activeId: "z", anchor: "a", ids: new Set(["a"]) }),
      { id: "c", modifier: "meta", type: "click" }
    );
    expect(ids(next.ids)).toEqual(["a", "c"]);
    expect(next.anchor).toBe("c");
  });

  it("does NOT promote when meta-clicking the active link itself", () => {
    const next = transition(state({ activeId: "a" }), {
      id: "a",
      modifier: "meta",
      type: "click",
    });
    expect(ids(next.ids)).toEqual(["a"]);
    expect(next.anchor).toBe("a");
  });

  it("just adds when there is no active link", () => {
    const next = transition(state(), {
      id: "b",
      modifier: "meta",
      type: "click",
    });
    expect(ids(next.ids)).toEqual(["b"]);
    expect(next.anchor).toBe("b");
  });

  it("removes an already-selected id (toggle off)", () => {
    const next = transition(state({ anchor: "a", ids: new Set(["a", "b"]) }), {
      id: "a",
      modifier: "meta",
      type: "click",
    });
    expect(ids(next.ids)).toEqual(["b"]);
    expect(next.anchor).toBe("a");
  });

  it("clears anchor when the last selected id is removed", () => {
    const next = transition(state({ anchor: "a", ids: new Set(["a"]) }), {
      id: "a",
      modifier: "meta",
      type: "click",
    });
    expect(next.ids.size).toBe(0);
    expect(next.anchor).toBeNull();
  });

  it("does not mutate input", () => {
    const prev = state({ ids: new Set(["a"]) });
    const next = transition(prev, {
      id: "b",
      modifier: "meta",
      type: "click",
    });
    expect(next.ids).not.toBe(prev.ids);
    expect([...prev.ids]).toEqual(["a"]);
  });

  it("preserves allIds and activeId on the next state", () => {
    const prev = state({ activeId: "z" });
    const next = transition(prev, {
      id: "b",
      modifier: "meta",
      type: "click",
    });
    expect(next.allIds).toBe(prev.allIds);
    expect(next.activeId).toBe("z");
  });
});

describe("transition › click › shift", () => {
  it("ranges from existing anchor to target", () => {
    const next = transition(state({ anchor: "b", ids: new Set(["b"]) }), {
      id: "d",
      modifier: "shift",
      type: "click",
    });
    expect(ids(next.ids)).toEqual(["b", "c", "d"]);
    expect(next.anchor).toBe("b");
  });

  it("preserves anchor across consecutive shift-clicks", () => {
    const first = transition(state({ anchor: "a", ids: new Set(["a"]) }), {
      id: "c",
      modifier: "shift",
      type: "click",
    });
    const second = transition(first, {
      id: "e",
      modifier: "shift",
      type: "click",
    });
    expect(ids(second.ids)).toEqual(["a", "b", "c", "d", "e"]);
    expect(second.anchor).toBe("a");
  });

  it("uses activeId as anchor when there is no explicit anchor", () => {
    const next = transition(state({ activeId: "b" }), {
      id: "d",
      modifier: "shift",
      type: "click",
    });
    expect(ids(next.ids)).toEqual(["b", "c", "d"]);
    expect(next.anchor).toBe("b");
  });

  it("falls back to a single selection when no anchor and no active", () => {
    const next = transition(state(), {
      id: "c",
      modifier: "shift",
      type: "click",
    });
    expect(ids(next.ids)).toEqual(["c"]);
    expect(next.anchor).toBe("c");
  });

  it("falls back to a single selection when anchor is no longer in allIds", () => {
    const next = transition(state({ anchor: "missing", ids: new Set(["a"]) }), {
      id: "c",
      modifier: "shift",
      type: "click",
    });
    expect(ids(next.ids)).toEqual(["c"]);
    expect(next.anchor).toBe("c");
  });

  it("handles target before anchor (reversed range)", () => {
    const next = transition(state({ anchor: "d", ids: new Set(["d"]) }), {
      id: "b",
      modifier: "shift",
      type: "click",
    });
    expect(ids(next.ids)).toEqual(["b", "c", "d"]);
    expect(next.anchor).toBe("d");
  });

  it("preserves selection outside the range", () => {
    const next = transition(state({ anchor: "c", ids: new Set(["a", "c"]) }), {
      id: "d",
      modifier: "shift",
      type: "click",
    });
    expect(ids(next.ids)).toEqual(["a", "c", "d"]);
  });
});

describe("transition › click › none", () => {
  it("is a no-op (plain clicks open detail; selection is unchanged)", () => {
    const prev = state({ anchor: "a", ids: new Set(["a", "b"]) });
    const next = transition(prev, {
      id: "c",
      modifier: "none",
      type: "click",
    });
    expect(next).toBe(prev);
  });
});

describe("transition › checkbox", () => {
  it("adds when missing", () => {
    const next = transition(state(), { id: "a", type: "checkbox" });
    expect(ids(next.ids)).toEqual(["a"]);
    expect(next.anchor).toBe("a");
  });

  it("removes when present", () => {
    const next = transition(state({ anchor: "a", ids: new Set(["a", "b"]) }), {
      id: "a",
      type: "checkbox",
    });
    expect(ids(next.ids)).toEqual(["b"]);
    expect(next.anchor).toBe("a");
  });

  it("clears anchor when last id removed", () => {
    const next = transition(state({ anchor: "a", ids: new Set(["a"]) }), {
      id: "a",
      type: "checkbox",
    });
    expect(next.ids.size).toBe(0);
    expect(next.anchor).toBeNull();
  });

  it("does NOT promote the active link (unlike meta-click)", () => {
    const next = transition(state({ activeId: "a" }), {
      id: "c",
      type: "checkbox",
    });
    expect(ids(next.ids)).toEqual(["c"]);
  });
});

describe("transition › clear", () => {
  it("returns the same reference when already empty", () => {
    const prev = state();
    expect(transition(prev, { type: "clear" })).toBe(prev);
  });

  it("resets a populated state to empty selection", () => {
    const next = transition(state({ anchor: "a", ids: new Set(["a", "b"]) }), {
      type: "clear",
    });
    expect(next.ids.size).toBe(0);
    expect(next.anchor).toBeNull();
  });

  it("preserves allIds and activeId", () => {
    const prev = state({
      activeId: "z",
      anchor: "a",
      ids: new Set(["a"]),
    });
    const next = transition(prev, { type: "clear" });
    expect(next.allIds).toBe(prev.allIds);
    expect(next.activeId).toBe("z");
  });
});

describe("transition › prune", () => {
  it("drops ids absent from the valid set", () => {
    const next = transition(
      state({ anchor: "a", ids: new Set(["a", "b", "c"]) }),
      { type: "prune", validIds: new Set(["a", "c"]) }
    );
    expect(ids(next.ids)).toEqual(["a", "c"]);
    expect(next.anchor).toBe("a");
  });

  it("clears anchor when the anchor disappears", () => {
    const next = transition(state({ anchor: "b", ids: new Set(["a", "b"]) }), {
      type: "prune",
      validIds: new Set(["a"]),
    });
    expect(ids(next.ids)).toEqual(["a"]);
    expect(next.anchor).toBeNull();
  });

  it("clears anchor when all ids are filtered out", () => {
    const next = transition(state({ anchor: "a", ids: new Set(["a"]) }), {
      type: "prune",
      validIds: new Set(["x"]),
    });
    expect(next.ids.size).toBe(0);
    expect(next.anchor).toBeNull();
  });

  it("returns the same reference when nothing is stale", () => {
    const prev = state({ anchor: "a", ids: new Set(["a"]) });
    expect(
      transition(prev, { type: "prune", validIds: new Set(["a", "b"]) })
    ).toBe(prev);
  });
});

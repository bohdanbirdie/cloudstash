export type Modifier = "none" | "meta" | "shift";

export interface State {
  readonly ids: ReadonlySet<string>;
  readonly anchor: string | null;
  readonly allIds: readonly string[];
  readonly activeId: string | null;
}

export type Action =
  | { type: "click"; id: string; modifier: Modifier }
  | { type: "checkbox"; id: string }
  | { type: "clear" }
  | { type: "prune"; validIds: ReadonlySet<string> };

export function transition(state: State, action: Action): State {
  switch (action.type) {
    case "click":
      return click(state, action.id, action.modifier);
    case "checkbox":
      return toggle(state, action.id);
    case "clear":
      return state.ids.size === 0 && state.anchor === null
        ? state
        : { ...state, anchor: null, ids: new Set() };
    case "prune":
      return prune(state, action.validIds);
  }
}

function click(state: State, id: string, modifier: Modifier): State {
  if (modifier === "meta") {
    if (
      state.ids.size === 0 &&
      state.activeId !== null &&
      state.activeId !== id
    ) {
      return { ...state, anchor: id, ids: new Set([state.activeId, id]) };
    }
    return toggle(state, id);
  }

  if (modifier === "shift") {
    const anchor = state.anchor ?? state.activeId;
    const range = computeRange(anchor, id, state.allIds);
    if (range === null) {
      return { ...state, anchor: id, ids: new Set([id]) };
    }
    const next = new Set(state.ids);
    for (const rid of range) next.add(rid);
    return {
      ...state,
      anchor: state.anchor ?? state.activeId ?? id,
      ids: next,
    };
  }

  return state;
}

function toggle(state: State, id: string): State {
  const next = new Set(state.ids);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return {
    ...state,
    anchor: next.size === 0 ? null : id,
    ids: next,
  };
}

function prune(state: State, validIds: ReadonlySet<string>): State {
  let dropped = 0;
  const next = new Set<string>();
  for (const id of state.ids) {
    if (validIds.has(id)) next.add(id);
    else dropped++;
  }
  const anchorStale = state.anchor !== null && !validIds.has(state.anchor);
  if (dropped === 0 && !anchorStale) return state;
  if (next.size === 0 || anchorStale) {
    return { ...state, anchor: null, ids: next };
  }
  return { ...state, ids: next };
}

function computeRange(
  anchor: string | null,
  target: string,
  allIds: readonly string[]
): readonly string[] | null {
  if (anchor === null) return null;
  const ai = allIds.indexOf(anchor);
  const ti = allIds.indexOf(target);
  if (ai === -1 || ti === -1) return null;
  const start = Math.min(ai, ti);
  const end = Math.max(ai, ti);
  return allIds.slice(start, end + 1);
}

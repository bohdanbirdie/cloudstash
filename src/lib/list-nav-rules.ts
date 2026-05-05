import { computeTargetIndex } from "./listbox-keyboard";

export interface ListNavCursor {
  activeId: string | null;
  anchorId: string | null;
}

export function cursor(s: ListNavCursor): string | null {
  return s.activeId ?? s.anchorId;
}

export function anchorAfterHover(
  s: ListNavCursor,
  hoveredId: string
): string | null {
  return s.activeId === null ? hoveredId : s.anchorId;
}

export function moveTarget<T extends { id: string }>(
  s: ListNavCursor,
  items: readonly T[],
  delta: number | "home" | "end"
): string | null {
  const idx = computeTargetIndex(items, cursor(s), delta);
  return items[idx]?.id ?? null;
}

export function arrowOpensDetail(s: ListNavCursor, targetId: string): boolean {
  return s.activeId !== null && targetId !== s.activeId;
}

export function findRowInContainer(
  target: EventTarget | null,
  container: HTMLElement | null
): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const row = target.closest<HTMLElement>("[data-id]");
  return row && container?.contains(row) ? row : null;
}

export function focusRowById(container: HTMLElement | null, id: string): void {
  container
    ?.querySelector<HTMLElement>(`[data-id="${id}"]`)
    ?.focus({ preventScroll: true });
}

export function clearKeyboardFocusFromOtherRow(
  container: HTMLElement,
  currentRow: HTMLElement
): void {
  const focused = document.activeElement;
  if (
    focused instanceof HTMLElement &&
    focused !== currentRow &&
    focused.dataset.id &&
    container.contains(focused)
  ) {
    focused.blur();
  }
}

export function computeTargetIndex<T extends { id: string }>(
  items: readonly T[],
  cursorId: string | null,
  delta: number | "home" | "end"
): number {
  if (items.length === 0) return -1;
  if (delta === "home") return 0;
  if (delta === "end") return items.length - 1;
  const startIdx = cursorId ? items.findIndex((i) => i.id === cursorId) : -1;
  if (startIdx < 0) return 0;
  return Math.max(0, Math.min(startIdx + delta, items.length - 1));
}

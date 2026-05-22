const SCROLL_MARGIN_PX = 24;

export function findRowInContainer(
  target: EventTarget | null,
  container: HTMLElement | null
): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const row = target.closest<HTMLElement>("[data-id]");
  return row && container?.contains(row) ? row : null;
}

export function focusRowById(container: HTMLElement | null, id: string): void {
  const row = container?.querySelector<HTMLElement>(`[data-id="${id}"]`);
  if (!row) return;
  row.focus({ preventScroll: true });
  scrollRowIntoView(row);
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
    container.focus({ preventScroll: true });
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

function scrollRowIntoView(row: HTMLElement): void {
  const viewport = findScrollableAncestor(row);
  if (!viewport) return;

  const vp = viewport.getBoundingClientRect();
  const r = row.getBoundingClientRect();

  const topGap = r.top - (vp.top + SCROLL_MARGIN_PX);
  const bottomGap = r.bottom - (vp.bottom - SCROLL_MARGIN_PX);

  if (topGap < 0) {
    viewport.scrollTop += topGap;
  } else if (bottomGap > 0) {
    viewport.scrollTop += bottomGap;
  }
}

function findScrollableAncestor(el: HTMLElement): HTMLElement | null {
  let cur: HTMLElement | null = el.parentElement;
  while (cur) {
    const overflowY = getComputedStyle(cur).overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      cur.scrollHeight > cur.clientHeight
    ) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

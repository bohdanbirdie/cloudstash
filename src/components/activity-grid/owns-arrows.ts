export function isInActivityGrid(e: KeyboardEvent): boolean {
  return (
    e.target instanceof HTMLElement &&
    e.target.closest("[data-cell-idx]") !== null
  );
}
